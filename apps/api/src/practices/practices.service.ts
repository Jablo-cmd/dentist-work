import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  UpdatePracticeRequest,
  CreatePracticeRequest,
  Paginated,
  PaginationQuery,
  Practice,
} from '@dpms/contracts';
import { practiceScope } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const toDto = (p: { id: string; name: string; code: string; isActive: boolean }): Practice => ({
  id: p.id,
  name: p.name,
  code: p.code,
  isActive: p.isActive,
});

@Injectable()
export class PracticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Visibility filter derived from the server-side principal — never from client input. */
  private scopeWhere(p: Principal): Prisma.PracticeWhereInput {
    const scope = practiceScope(p.assignments, 'practice.read');
    return scope.orgWide
      ? { organisationId: p.organisationId }
      : { organisationId: p.organisationId, id: { in: scope.practiceIds } };
  }

  async list(p: Principal, q: PaginationQuery): Promise<Paginated<Practice>> {
    const where = this.scopeWhere(p);
    const [total, rows] = await Promise.all([
      this.prisma.practice.count({ where }),
      this.prisma.practice.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.ceil(total / q.pageSize),
      },
    };
  }

  async get(p: Principal, id: string, requestId: string, ip?: string): Promise<Practice> {
    const row = await this.prisma.practice.findFirst({
      where: { AND: [this.scopeWhere(p), { id }] },
    });
    if (!row) {
      // Out-of-scope and non-existent are indistinguishable to the caller (no IDOR oracle).
      await this.audit.recordBestEffort({
        action: 'access.denied',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        targetType: 'practice',
        targetId: id,
        requestId,
        ipAddress: ip,
      });
      throw new NotFoundException();
    }
    return toDto(row);
  }

  async update(
    p: Principal,
    id: string,
    input: UpdatePracticeRequest,
    requestId: string,
    ip?: string,
  ): Promise<Practice> {
    const existing = await this.prisma.practice.findFirst({
      where: { id, organisationId: p.organisationId },
    });
    if (!existing) throw new NotFoundException();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.practice.update({
          where: { id },
          data: { name: input.name, isActive: input.isActive },
        });
        await this.audit.record(
          {
            action: 'practice.update',
            outcome: 'SUCCESS',
            actorUserId: p.id,
            organisationId: p.organisationId,
            practiceId: id,
            targetType: 'practice',
            targetId: id,
            requestId,
            ipAddress: ip,
            metadata: { activeChanged: input.isActive !== undefined },
          },
          tx,
        );
        return toDto(row);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw new ConflictException('A practice with that name already exists.');
      throw err;
    }
  }

  async create(
    p: Principal,
    input: CreatePracticeRequest,
    requestId: string,
    ip?: string,
  ): Promise<Practice> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.practice.create({
          data: { organisationId: p.organisationId, name: input.name, code: input.code },
        });
        await this.audit.record(
          {
            action: 'practice.create',
            outcome: 'SUCCESS',
            actorUserId: p.id,
            organisationId: p.organisationId,
            practiceId: row.id,
            targetType: 'practice',
            targetId: row.id,
            requestId,
            ipAddress: ip,
          },
          tx,
        );
        return toDto(row);
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A practice with that name or code already exists.');
      }
      throw err;
    }
  }
}
