import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FinancialSummary, OperationalSummary, ReportQuery } from '@dpms/contracts';
import { hasPermission, practiceScope } from '../access/permissions';
import type { Principal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Ctx } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { dec, fmt, ZERO, type Dec } from './money';

const sastStart = (d: string) => new Date(`${d}T00:00:00+02:00`);
const nextDay = (d: string) => new Date(sastStart(d).getTime() + 86_400_000);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Practices the caller may report on, optionally narrowed by the requested practice. */
  private async practices(
    p: Principal,
    permission: 'financial_report.read' | 'appointment.read',
    only?: string,
  ): Promise<string[]> {
    const s = practiceScope(p.assignments, permission);
    const all = await this.prisma.practice.findMany({
      where: {
        organisationId: p.organisationId,
        ...(s.orgWide ? {} : { id: { in: s.practiceIds } }),
      },
      select: { id: true },
    });
    const ids = all.map((x) => x.id);
    return only ? ids.filter((x) => x === only) : ids;
  }

  async financial(p: Principal, q: ReportQuery, ctx: Ctx): Promise<FinancialSummary> {
    const ids = await this.practices(p, 'financial_report.read', q.practiceId);
    const from = new Date(`${q.from}T00:00:00Z`);
    const to = new Date(`${q.to}T00:00:00Z`);
    const perPractice: FinancialSummary['perPractice'] = [];
    const totals = { invoiced: ZERO, credited: ZERO, paid: ZERO, outstanding: ZERO };
    for (const practiceId of ids) {
      const [inv, cred, pays, out] = await Promise.all([
        this.prisma.invoice.aggregate({
          where: {
            practiceId,
            kind: 'INVOICE',
            status: 'POSTED',
            issueDate: { gte: from, lte: to },
          },
          _sum: { total: true },
        }),
        this.prisma.invoice.aggregate({
          where: {
            practiceId,
            kind: 'CREDIT_NOTE',
            status: 'POSTED',
            issueDate: { gte: from, lte: to },
          },
          _sum: { total: true },
        }),
        this.prisma.payment.groupBy({
          by: ['method'],
          where: { practiceId, status: 'RECORDED', receivedOn: { gte: from, lte: to } },
          _sum: { amount: true },
        }),
        this.prisma.$queryRaw<{ outstanding: Prisma.Decimal | null }[]>`
          SELECT COALESCE(SUM(i."total"
            - COALESCE((SELECT SUM(a."amount") FROM payment_allocations a JOIN payments p ON p."id" = a."paymentId" WHERE a."invoiceId" = i."id" AND p."status" = 'RECORDED'), 0)
            - COALESCE((SELECT SUM(c."total") FROM invoices c WHERE c."creditsInvoiceId" = i."id" AND c."kind" = 'CREDIT_NOTE' AND c."status" = 'POSTED'), 0)), 0) AS outstanding
          FROM invoices i
          WHERE i."practiceId" = ${practiceId}::uuid AND i."kind" = 'INVOICE' AND i."status" = 'POSTED' AND i."issueDate" <= ${to}::date`,
      ]);
      const invoiced = inv._sum.total ?? ZERO;
      const credited = cred._sum.total ?? ZERO;
      const byMethod: Record<string, string> = {};
      let received: Dec = ZERO;
      for (const m of pays) {
        byMethod[m.method] = fmt(m._sum.amount);
        received = received.add(m._sum.amount ?? ZERO);
      }
      const outstanding = dec(out[0]?.outstanding ?? 0);
      perPractice.push({
        practiceId,
        invoiced: fmt(invoiced),
        credited: fmt(credited),
        netInvoiced: fmt(invoiced.sub(credited)),
        paymentsReceived: fmt(received),
        paymentsByMethod: byMethod,
        outstandingInvoices: fmt(outstanding),
      });
      totals.invoiced = totals.invoiced.add(invoiced);
      totals.credited = totals.credited.add(credited);
      totals.paid = totals.paid.add(received);
      totals.outstanding = totals.outstanding.add(outstanding);
    }
    await this.audit.record({
      action: 'report.financial',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      practiceId: q.practiceId && ids.includes(q.practiceId) ? q.practiceId : null,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return {
      from: q.from,
      to: q.to,
      perPractice,
      totals: {
        invoiced: fmt(totals.invoiced),
        credited: fmt(totals.credited),
        paymentsReceived: fmt(totals.paid),
        outstandingInvoices: fmt(totals.outstanding),
      },
    };
  }

  async operational(p: Principal, q: ReportQuery, ctx: Ctx): Promise<OperationalSummary> {
    const ids = await this.practices(p, 'appointment.read', q.practiceId);
    const range = { gte: sastStart(q.from), lt: nextDay(q.to) };
    const perPractice: OperationalSummary['perPractice'] = [];
    for (const practiceId of ids) {
      const grouped = await this.prisma.appointment.groupBy({
        by: ['status'],
        where: { practiceId, startsAt: range },
        _count: { _all: true },
      });
      const appointments: Record<string, number> = {};
      for (const g of grouped) appointments[g.status] = g._count._all;
      const newPatients = hasPermission(p.assignments, 'patient.read', { practiceId })
        ? await this.prisma.patient.count({
            where: { registeringPracticeId: practiceId, createdAt: range },
          })
        : null;
      perPractice.push({ practiceId, appointments, newPatients });
    }
    await this.audit.record({
      action: 'report.operational',
      outcome: 'SUCCESS',
      actorUserId: p.id,
      organisationId: p.organisationId,
      practiceId: q.practiceId && ids.includes(q.practiceId) ? q.practiceId : null,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return { from: q.from, to: q.to, perPractice };
  }
}
