import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  StreamableFile,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ImagingAsset, UploadImagingFields } from '@dpms/contracts';
import { hasPermission } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Ctx } from '../common/request-context';
import { ENV, type Env } from '../config/env';
import { PatientAccessService } from '../patients/patient-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage';
import { sanitiseFilename, sniffMime } from './file-signature';
import { ImagingScanService } from './imaging-scan.service';

const REJECTED_MESSAGE =
  'This file was rejected by the security scan and has not been stored. Do not retry with the same file.';
const UNAVAILABLE_MESSAGE =
  'This file is not available: it is awaiting a security scan or has been quarantined.';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const INLINE = new Set(['image/jpeg', 'image/png']);
type Row = Prisma.ImagingAssetGetPayload<object>;

const toDto = (r: Row): ImagingAsset => ({
  id: r.id,
  patientId: r.patientId,
  practiceId: r.practiceId,
  encounterId: r.encounterId,
  modality: r.modality,
  mimeType: r.mimeType as ImagingAsset['mimeType'],
  originalFilename: r.originalFilename,
  sizeBytes: r.sizeBytes,
  sha256: r.sha256,
  source: r.source,
  scanStatus: r.scanStatus,
  available: r.scanStatus === 'CLEAN',
  acquiredAt: r.acquiredAt?.toISOString() ?? null,
  uploadedByUserId: r.uploadedByUserId,
  uploadedAt: r.uploadedAt.toISOString(),
});

@Injectable()
export class ImagingService {
  private readonly logger = new Logger(ImagingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
    private readonly scan: ImagingScanService,
  ) {}

  async upload(
    p: Principal,
    patientId: string,
    file: UploadedFile | undefined,
    fields: UploadImagingFields,
    ctx: Ctx,
  ): Promise<ImagingAsset> {
    if (!this.storage.configured)
      throw new ServiceUnavailableException(
        'Object storage is not configured; imaging is unavailable.',
      );
    if (!file || file.size === 0)
      throw new BadRequestException('Attach a non-empty file in the "file" field.');
    if (file.size > this.env.imagingMaxBytes)
      throw new PayloadTooLargeException('File exceeds the maximum allowed size.');

    const patient = await this.access.require(p, patientId, 'imaging.upload', ctx);
    if (!hasPermission(p.assignments, 'imaging.upload', { practiceId: fields.practiceId }))
      throw new ForbiddenException();
    if (!patient.practices.some((x) => x.practiceId === fields.practiceId))
      throw new NotFoundException();
    if (
      fields.encounterId &&
      !(await this.prisma.clinicalEncounter.count({ where: { id: fields.encounterId, patientId } }))
    ) {
      throw new BadRequestException('Encounter does not belong to this patient.');
    }

    // The declared type and filename are untrusted: identify the file from its content.
    const mime = sniffMime(file.buffer);
    if (!mime)
      throw new UnsupportedMediaTypeException(
        'Unsupported file type. Accepted: JPEG, PNG, PDF, DICOM.',
      );
    const declared = file.mimetype.toLowerCase();
    if (declared !== 'application/octet-stream' && declared !== mime) {
      throw new UnsupportedMediaTypeException('File content does not match its declared type.');
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.prisma.imagingAsset.findFirst({
      where: { patientId, sha256 },
      select: { scanStatus: true },
    });
    if (existing?.scanStatus === 'INFECTED')
      throw new UnprocessableEntityException(REJECTED_MESSAGE);
    if (existing)
      throw new ConflictException('This file has already been uploaded for this patient.');

    const objectKey = `imaging/${p.organisationId}/${randomUUID()}`;
    await this.storage.put(objectKey, file.buffer, mime);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const r = await tx.imagingAsset.create({
          data: {
            organisationId: p.organisationId,
            practiceId: fields.practiceId,
            patientId,
            encounterId: fields.encounterId ?? null,
            modality: fields.modality,
            mimeType: mime,
            originalFilename: sanitiseFilename(file.originalname),
            sizeBytes: file.size,
            sha256,
            objectKey,
            acquiredAt: fields.acquiredAt ? new Date(fields.acquiredAt) : null,
            uploadedByUserId: p.id,
          },
        });
        await this.audit.record(
          {
            action: 'imaging.upload',
            outcome: 'SUCCESS',
            actorUserId: p.id,
            organisationId: p.organisationId,
            practiceId: fields.practiceId,
            targetType: 'imaging_asset',
            targetId: r.id,
            requestId: ctx.requestId,
            ipAddress: ctx.ip,
            metadata: { modality: fields.modality, bytes: file.size },
          },
          tx,
        );
        return r;
      });
      // The file is quarantined (PENDING) from this moment. It becomes available only if the scan
      // returns a definite clean verdict; any other outcome leaves it inaccessible.
      const status = await this.scan.scanAndRecord(row, file.buffer, {
        userId: p.id,
        requestId: ctx.requestId,
        ip: ctx.ip,
      });
      if (status === 'INFECTED') throw new UnprocessableEntityException(REJECTED_MESSAGE);
      return toDto(await this.prisma.imagingAsset.findUniqueOrThrow({ where: { id: row.id } }));
    } catch (e) {
      if (e instanceof UnprocessableEntityException) throw e;
      // Do not leave an unreferenced object behind if the metadata could not be saved.
      await this.storage
        .remove(objectKey)
        .catch(() =>
          this.logger.error({ msg: 'orphaned object cleanup failed', requestId: ctx.requestId }),
        );
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ConflictException('This file has already been uploaded for this patient.');
      throw e;
    }
  }

  async list(p: Principal, patientId: string, ctx: Ctx): Promise<ImagingAsset[]> {
    await this.access.require(p, patientId, 'imaging.view', ctx);
    const rows = await this.prisma.imagingAsset.findMany({
      where: { patientId },
      orderBy: { uploadedAt: 'desc' },
      take: 500,
    });
    await this.audit.record({
      action: 'imaging.list',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      targetType: 'patient',
      targetId: patientId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return rows.map(toDto);
  }

  private async loadVisible(p: Principal, id: string, ctx: Ctx): Promise<Row> {
    // Permission is re-evaluated on every request (view and download); nothing is cached or pre-signed.
    const row = await this.prisma.imagingAsset.findFirst({
      where: { AND: [{ id }, { patient: this.access.where(p, 'imaging.view') }] },
    });
    if (!row) {
      await this.audit.recordBestEffort({
        action: 'access.denied',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        targetType: 'imaging_asset',
        targetId: id,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      throw new NotFoundException();
    }
    return row;
  }

  async get(p: Principal, id: string, ctx: Ctx): Promise<ImagingAsset> {
    const row = await this.loadVisible(p, id, ctx);
    await this.audit.record({
      action: 'imaging.view',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      practiceId: row.practiceId,
      targetType: 'imaging_asset',
      targetId: id,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return toDto(row);
  }

  async download(p: Principal, id: string, ctx: Ctx): Promise<StreamableFile> {
    const row = await this.loadVisible(p, id, ctx);
    if (row.scanStatus !== 'CLEAN') {
      // Fail closed: only files that passed the malware scan are ever released.
      await this.audit.recordBestEffort({
        action: 'imaging.download',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        practiceId: row.practiceId,
        targetType: 'imaging_asset',
        targetId: id,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        metadata: { reason: 'not_scanned_clean', scanStatus: row.scanStatus },
      });
      throw new ConflictException(UNAVAILABLE_MESSAGE);
    }
    // Fail closed: the access is recorded before any bytes are released.
    await this.audit.record({
      action: 'imaging.download',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      practiceId: row.practiceId,
      targetType: 'imaging_asset',
      targetId: id,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    const obj = await this.storage.get(row.objectKey);
    const name = encodeURIComponent(row.originalFilename);
    return new StreamableFile(obj.stream, {
      type: row.mimeType, // from content sniffing at upload, never from client input
      length: obj.sizeBytes || row.sizeBytes,
      disposition: `${INLINE.has(row.mimeType) ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
    });
  }

  /** Staff-triggered re-scan (e.g. after the scanner was restored). Only files still awaiting a verdict are scanned. */
  async rescan(p: Principal, id: string, ctx: Ctx): Promise<ImagingAsset> {
    const row = await this.prisma.imagingAsset.findFirst({
      where: { AND: [{ id }, { patient: this.access.where(p, 'imaging.upload') }] },
    });
    if (!row || !hasPermission(p.assignments, 'imaging.upload', { practiceId: row.practiceId }))
      throw new NotFoundException();
    if (row.scanStatus === 'CLEAN' || row.scanStatus === 'INFECTED')
      throw new ConflictException('This file already has a final scan result.');
    if (!this.scan.scanner.configured)
      throw new ServiceUnavailableException(
        'Malware scanning is not configured; the file stays quarantined.',
      );
    await this.scan.rescanOne(row, { userId: p.id, requestId: ctx.requestId, ip: ctx.ip });
    return toDto(await this.prisma.imagingAsset.findUniqueOrThrow({ where: { id } }));
  }
}
