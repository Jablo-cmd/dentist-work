import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ITEM_TRANSITIONS,
  type ChangeItemStatusRequest,
  type CreateTreatmentPlanRequest,
  type TreatmentItemInput,
  type TreatmentPlan,
} from '@dpms/contracts';
import { hasPermission } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Ctx } from '../common/request-context';
import { PatientAccessService } from '../patients/patient-access.service';
import { PrismaService } from '../prisma/prisma.service';

type PlanRow = Prisma.TreatmentPlanGetPayload<{
  include: { items: { include: { events: true } } };
}>;
const INCLUDE = {
  items: { include: { events: { orderBy: { occurredAt: 'asc' } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TreatmentPlanInclude;

const toDto = (r: PlanRow): TreatmentPlan => ({
  id: r.id,
  patientId: r.patientId,
  practiceId: r.practiceId,
  title: r.title,
  createdAt: r.createdAt.toISOString(),
  items: r.items.map((i) => ({
    id: i.id,
    toothNumber: i.toothNumber,
    description: i.description,
    estimatedAmount: i.estimatedAmount?.toFixed(2) ?? null,
    status: i.status,
    history: i.events.map((e) => ({
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      occurredAt: e.occurredAt.toISOString(),
      actorUserId: e.actorUserId,
      note: e.note,
    })),
  })),
});

@Injectable()
export class TreatmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
  ) {}

  private ev(
    p: Principal,
    ctx: Ctx,
    action: string,
    targetId: string,
    practiceId: string,
    meta?: Record<string, string>,
  ) {
    return {
      action,
      outcome: 'SUCCESS' as const,
      actorUserId: p.id,
      organisationId: p.organisationId,
      practiceId,
      targetType: 'treatment_plan',
      targetId,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      metadata: meta,
    };
  }

  private itemData(i: TreatmentItemInput) {
    return {
      toothNumber: i.toothNumber ?? null,
      description: i.description,
      estimatedAmount: i.estimatedAmount ?? null,
    };
  }

  private async loadPlan(
    p: Principal,
    id: string,
    permission: 'clinical_record.read' | 'clinical_record.create',
    ctx: Ctx,
  ): Promise<PlanRow> {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { AND: [{ id }, { patient: this.access.where(p, permission) }] },
      include: INCLUDE,
    });
    if (!plan) {
      await this.audit.recordBestEffort({
        action: 'access.denied',
        outcome: 'DENIED',
        actorUserId: p.id,
        organisationId: p.organisationId,
        targetType: 'treatment_plan',
        targetId: id,
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      throw new NotFoundException();
    }
    return plan;
  }

  async listForPatient(p: Principal, patientId: string, ctx: Ctx): Promise<TreatmentPlan[]> {
    await this.access.require(p, patientId, 'clinical_record.read', ctx);
    const rows = await this.prisma.treatmentPlan.findMany({
      where: { patientId },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    await this.audit.record({
      action: 'treatment_plan.list',
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

  async get(p: Principal, id: string, ctx: Ctx): Promise<TreatmentPlan> {
    return toDto(await this.loadPlan(p, id, 'clinical_record.read', ctx));
  }

  async create(
    p: Principal,
    patientId: string,
    input: CreateTreatmentPlanRequest,
    ctx: Ctx,
  ): Promise<TreatmentPlan> {
    const patient = await this.access.require(p, patientId, 'clinical_record.create', ctx);
    if (!hasPermission(p.assignments, 'clinical_record.create', { practiceId: input.practiceId }))
      throw new ForbiddenException();
    if (!patient.practices.some((x) => x.practiceId === input.practiceId))
      throw new NotFoundException();
    const id = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.treatmentPlan.create({
        data: {
          organisationId: p.organisationId,
          practiceId: input.practiceId,
          patientId,
          title: input.title,
          createdByUserId: p.id,
        },
      });
      for (const item of input.items) {
        const created = await tx.treatmentPlanItem.create({
          data: { planId: plan.id, ...this.itemData(item) },
        });
        await tx.treatmentPlanItemEvent.create({
          data: { itemId: created.id, toStatus: 'PROPOSED', actorUserId: p.id },
        });
      }
      await this.audit.record(
        this.ev(p, ctx, 'treatment_plan.create', plan.id, input.practiceId),
        tx,
      );
      return plan.id;
    });
    return toDto(
      await this.prisma.treatmentPlan.findUniqueOrThrow({ where: { id }, include: INCLUDE }),
    );
  }

  async addItem(
    p: Principal,
    planId: string,
    input: TreatmentItemInput,
    ctx: Ctx,
  ): Promise<TreatmentPlan> {
    const plan = await this.loadPlan(p, planId, 'clinical_record.create', ctx);
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.treatmentPlanItem.create({
        data: { planId, ...this.itemData(input) },
      });
      await tx.treatmentPlanItemEvent.create({
        data: { itemId: created.id, toStatus: 'PROPOSED', actorUserId: p.id },
      });
      await this.audit.record(
        this.ev(p, ctx, 'treatment_plan.add_item', planId, plan.practiceId),
        tx,
      );
    });
    return toDto(
      await this.prisma.treatmentPlan.findUniqueOrThrow({
        where: { id: planId },
        include: INCLUDE,
      }),
    );
  }

  async changeStatus(
    p: Principal,
    itemId: string,
    input: ChangeItemStatusRequest,
    ctx: Ctx,
  ): Promise<TreatmentPlan> {
    const item = await this.prisma.treatmentPlanItem.findFirst({
      where: { id: itemId, plan: { patient: this.access.where(p, 'clinical_record.create') } },
      include: { plan: true },
    });
    if (!item) throw new NotFoundException();
    if (!ITEM_TRANSITIONS[item.status].includes(input.status))
      throw new ConflictException(
        `A ${item.status.toLowerCase()} item cannot become ${input.status.toLowerCase()}.`,
      );
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.treatmentPlanItem.updateMany({
        where: { id: itemId, status: item.status },
        data: { status: input.status },
      });
      if (r.count === 0) throw new ConflictException('The item changed; reload and try again.');
      await tx.treatmentPlanItemEvent.create({
        data: {
          itemId,
          fromStatus: item.status,
          toStatus: input.status,
          actorUserId: p.id,
          note: input.note ?? null,
        },
      });
      await this.audit.record(
        this.ev(p, ctx, 'treatment_plan.item_status', item.planId, item.plan.practiceId, {
          to: input.status,
        }),
        tx,
      );
    });
    return toDto(
      await this.prisma.treatmentPlan.findUniqueOrThrow({
        where: { id: item.planId },
        include: INCLUDE,
      }),
    );
  }
}
