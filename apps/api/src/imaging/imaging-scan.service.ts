import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ScanStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { MALWARE_SCANNER, type MalwareScanner, type ScanResult } from '../scanner/malware-scanner';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage';

export interface ScanTarget {
  id: string;
  organisationId: string;
  practiceId: string;
  sha256: string;
  objectKey: string;
}
export interface ScanActor {
  userId?: string;
  requestId?: string;
  ip?: string;
}

const RETRY_INTERVAL_MS = 60_000;
const RETRY_BATCH = 10;

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string));
  return Buffer.concat(chunks);
}

/**
 * Owns the malware-scan lifecycle. Invariants:
 *  - the ONLY way a file becomes CLEAN is a definite `clean` verdict from the scanner;
 *  - any error, timeout, unexpected reply or missing scanner leaves the file unavailable;
 *  - the verdict and its audit record commit in one transaction (if the audit write fails, the
 *    status does not change and the file stays quarantined);
 *  - scanner internals are written to the audit trail only, never returned to ordinary users.
 */
@Injectable()
export class ImagingScanService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImagingScanService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MALWARE_SCANNER) readonly scanner: MalwareScanner,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.rescanPending(), RETRY_INTERVAL_MS);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Scans `content` for the asset and records the verdict. Never throws because of the scanner. */
  async scanAndRecord(asset: ScanTarget, content: Buffer, actor: ScanActor): Promise<ScanStatus> {
    const started = Date.now();
    let result: ScanResult;
    try {
      result = await this.scanner.scan(content);
    } catch {
      result = { verdict: 'error', reason: 'unavailable' };
    }
    return this.recordResult(asset, result, actor, Date.now() - started);
  }

  /** Persists a scan result (and its audit record) atomically. Only a `clean` verdict can make a file available. */
  private async recordResult(
    asset: ScanTarget,
    result: ScanResult,
    actor: ScanActor,
    durationMs: number,
  ): Promise<ScanStatus> {
    const base = {
      actorUserId: actor.userId ?? null,
      organisationId: asset.organisationId,
      practiceId: asset.practiceId,
      targetType: 'imaging_asset',
      targetId: asset.id,
      requestId: actor.requestId,
      ipAddress: actor.ip,
    };
    const live = { scanStatus: { in: ['PENDING', 'SCAN_FAILED'] as ScanStatus[] } };

    try {
      if (result.verdict === 'clean') {
        await this.prisma.$transaction(async (tx) => {
          const r = await tx.imagingAsset.updateMany({
            where: { id: asset.id, ...live },
            data: {
              scanStatus: 'CLEAN',
              scannedAt: new Date(),
              scanEngine: result.engine,
              scanAttempts: { increment: 1 },
            },
          });
          if (r.count === 1)
            await this.audit.record(
              {
                ...base,
                action: 'imaging.scan',
                outcome: 'SUCCESS',
                metadata: {
                  verdict: 'clean',
                  engine: result.engine,
                  sha256: asset.sha256,
                  durationMs,
                },
              },
              tx,
            );
        });
        return 'CLEAN';
      }
      if (result.verdict === 'infected') {
        await this.prisma.$transaction(async (tx) => {
          const r = await tx.imagingAsset.updateMany({
            where: { id: asset.id, ...live },
            data: {
              scanStatus: 'INFECTED',
              scannedAt: new Date(),
              scanEngine: result.engine,
              scanAttempts: { increment: 1 },
            },
          });
          if (r.count === 1)
            await this.audit.record(
              {
                ...base,
                action: 'imaging.scan',
                outcome: 'DENIED',
                metadata: {
                  verdict: 'infected',
                  engine: result.engine,
                  signature: result.signature,
                  sha256: asset.sha256,
                  durationMs,
                },
              },
              tx,
            );
        });
        // The record and hash are kept as evidence; the bytes are not.
        await this.storage
          .remove(asset.objectKey)
          .catch(() =>
            this.logger.error({ msg: 'could not delete quarantined object', assetId: asset.id }),
          );
        return 'INFECTED';
      }
      // error: remain unavailable. Not-configured is not an attempt (nothing was tried).
      const counted = result.reason !== 'not_configured';
      await this.prisma.$transaction(async (tx) => {
        await tx.imagingAsset.updateMany({
          where: { id: asset.id, ...live },
          data: {
            scanStatus: counted ? 'SCAN_FAILED' : 'PENDING',
            ...(counted ? { scanAttempts: { increment: 1 } } : {}),
          },
        });
        await this.audit.record(
          {
            ...base,
            action: 'imaging.scan',
            outcome: 'FAILURE',
            metadata: { verdict: 'error', reason: result.reason, sha256: asset.sha256, durationMs },
          },
          tx,
        );
      });
      return counted ? 'SCAN_FAILED' : 'PENDING';
    } catch (err) {
      // Could not record the outcome (e.g. audit failure): nothing was changed, so the file stays quarantined.
      this.logger.error({
        msg: 'scan outcome not recorded; file remains quarantined',
        assetId: asset.id,
        errName: err instanceof Error ? err.name : 'unknown',
      });
      return 'PENDING';
    }
  }

  /** Re-scans assets that are awaiting a verdict. Idempotent and safe with several instances (verdict writes are conditional). */
  async rescanPending(limit = RETRY_BATCH): Promise<{ scanned: number }> {
    if (!this.scanner.configured || !this.storage.configured || this.running) return { scanned: 0 };
    this.running = true;
    try {
      const rows = await this.prisma.imagingAsset.findMany({
        where: {
          scanStatus: { in: ['PENDING', 'SCAN_FAILED'] },
          scanAttempts: { lt: this.env.scannerMaxAttempts },
        },
        orderBy: { uploadedAt: 'asc' },
        take: limit,
      });
      for (const row of rows) await this.rescanOne(row, {});
      return { scanned: rows.length };
    } finally {
      this.running = false;
    }
  }

  /** Fetches the stored bytes and scans them. Used by the retry job and the manual re-scan endpoint. */
  async rescanOne(row: ScanTarget, actor: ScanActor): Promise<ScanStatus> {
    let content: Buffer;
    try {
      content = await readAll((await this.storage.get(row.objectKey)).stream);
    } catch {
      // Without the bytes there is nothing to certify: record a failed attempt, never a verdict.
      return this.recordResult(row, { verdict: 'error', reason: 'unavailable' }, actor, 0);
    }
    return this.scanAndRecord(row, content, actor);
  }
}
