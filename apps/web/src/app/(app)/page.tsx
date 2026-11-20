'use client';

import {
  appointmentSchema,
  auditEventSchema,
  financialSummarySchema,
  operationalSummarySchema,
  paginatedSchema,
  practiceSchema,
} from '@dpms/contracts';
import { Banknote, CalendarCheck, Receipt, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/brand';
import { fetchLiveness, fetchReadiness } from '@/lib/health';
import { rand } from '@/lib/money';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { APPOINTMENT_LABEL, APPOINTMENT_TONE } from '@/lib/status';
import { addDays, formatTime, sastDate, sastInstant } from '@/lib/time';
import { useApi } from '@/lib/use-api';

const sum = (xs: (number | null)[]) =>
  xs.every((x) => x === null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0);

export default function OverviewPage() {
  const { state } = useSession();
  const user = state.status === 'authenticated' ? state.user : null;
  const today = sastDate(new Date());
  const monthAgo = addDays(today, -30);
  const dayFrom = sastInstant(today, '00:00');
  const dayTo = sastInstant(addDays(today, 1), '00:00');

  const practices = useApi((s) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal: s }),
  );
  const schedule = useApi(
    async (s) =>
      user && can(user, 'appointment.read')
        ? apiFetch(
            `/appointments?from=${encodeURIComponent(dayFrom)}&to=${encodeURIComponent(dayTo)}`,
            z.array(appointmentSchema),
            { signal: s },
          )
        : null,
    [!!user, dayFrom],
  );
  const operational = useApi(
    async (s) =>
      user && can(user, 'appointment.read')
        ? apiFetch(
            `/reports/operational-summary?from=${monthAgo}&to=${today}`,
            operationalSummarySchema,
            { signal: s },
          )
        : null,
    [!!user, today],
  );
  const financial = useApi(
    async (s) =>
      user && can(user, 'financial_report.read')
        ? apiFetch(
            `/reports/financial-summary?from=${monthAgo}&to=${today}`,
            financialSummarySchema,
            { signal: s },
          )
        : null,
    [!!user, today],
  );
  const activity = useApi(
    async (s) =>
      user && can(user, 'audit.read')
        ? apiFetch('/audit-events?page=1&pageSize=6', paginatedSchema(auditEventSchema), {
            signal: s,
          })
        : null,
    [!!user],
  );

  if (!user) return null;
  const practiceName = (id: string | null) =>
    id === null
      ? 'All practices'
      : practices.status === 'success'
        ? (practices.data.data.find((p) => p.id === id)?.name ?? 'Practice')
        : '…';
  const seeAppointments = can(user, 'appointment.read');
  const seeFinance = can(user, 'financial_report.read');
  const hasKpis = seeAppointments || seeFinance;
  const todayList = schedule.status === 'success' && schedule.data ? schedule.data : [];
  const newPatients =
    operational.status === 'success' && operational.data
      ? sum(operational.data.perPractice.map((p) => p.newPatients))
      : null;

  const kpi = (loading: boolean, value: string | number | null) =>
    loading ? <Skeleton className="mt-1 h-7 w-20" /> : value === null ? '—' : value;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user.displayName}`}
        description={`${new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'full' }).format(new Date())} · figures cover only the practices you are authorised for.`}
      />

      {hasKpis && (
        <section
          aria-label="Key figures"
          className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
        >
          {seeAppointments && (
            <StatCard
              label="Today's appointments"
              icon={CalendarCheck}
              value={kpi(
                schedule.status === 'loading',
                schedule.status === 'success' ? todayList.length : null,
              )}
              hint={
                schedule.status === 'success'
                  ? `${todayList.filter((a) => a.status === 'CHECKED_IN').length} checked in · ${todayList.filter((a) => a.status === 'COMPLETED').length} completed`
                  : undefined
              }
            />
          )}
          {seeAppointments && newPatients !== null && (
            <StatCard
              label="New patients (30 days)"
              icon={UserPlus}
              value={newPatients}
              hint="Registered in the last 30 days"
            />
          )}
          {seeFinance && (
            <StatCard
              label="Outstanding invoices"
              icon={Receipt}
              tone="warning"
              value={kpi(
                financial.status === 'loading',
                financial.status === 'success' && financial.data
                  ? rand(financial.data.totals.outstandingInvoices)
                  : null,
              )}
              hint="Posted invoices still unpaid, as at now"
            />
          )}
          {seeFinance && (
            <StatCard
              label="Payments received (30 days)"
              icon={Banknote}
              value={kpi(
                financial.status === 'loading',
                financial.status === 'success' && financial.data
                  ? rand(financial.data.totals.paymentsReceived)
                  : null,
              )}
              hint={
                financial.status === 'success' && financial.data
                  ? `${rand(financial.data.totals.invoiced)} invoiced`
                  : undefined
              }
            />
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {seeAppointments && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Today&apos;s schedule</CardTitle>
                <CardDescription>All practices you can access.</CardDescription>
              </div>
              <Link
                href="/appointments"
                className="text-sm font-medium text-primary hover:underline"
              >
                Open calendar
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {schedule.status === 'loading' && (
                <div className="space-y-3 p-5" aria-busy="true">
                  <span className="sr-only">Loading today&apos;s schedule</span>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              )}
              {schedule.status === 'error' && (
                <ErrorState error={schedule.error} onRetry={schedule.reload} />
              )}
              {schedule.status === 'success' && todayList.length === 0 && (
                <EmptyState
                  title="No appointments today"
                  description="Nothing is booked for today across your practices."
                />
              )}
              {schedule.status === 'success' && todayList.length > 0 && (
                <ul className="divide-y">
                  {todayList.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                      <span className="w-14 shrink-0 font-medium tabular-nums">
                        {formatTime(a.startsAt)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {a.patientName ?? 'Patient'}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {a.practitionerName}
                          {a.reason ? ` · ${a.reason}` : ''}
                        </span>
                      </span>
                      <Badge tone={APPOINTMENT_TONE[a.status]}>{APPOINTMENT_LABEL[a.status]}</Badge>
                    </li>
                  ))}
                  {todayList.length > 8 && (
                    <li className="px-5 py-3 text-sm text-muted-foreground">
                      + {todayList.length - 8} more today
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your access</CardTitle>
              <CardDescription>
                Granted by your administrator, enforced by the server.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {practices.status === 'error' ? (
                <ErrorState error={practices.error} onRetry={practices.reload} />
              ) : (
                <ul className="space-y-2 text-sm">
                  {user.assignments.map((a) => (
                    <li
                      key={`${a.role}-${a.practiceId}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="font-medium">{ROLE_LABEL[a.role] ?? a.role}</span>
                      <Badge tone="brand">{practiceName(a.practiceId)}</Badge>
                    </li>
                  ))}
                  {user.assignments.length === 0 && (
                    <li className="text-muted-foreground">
                      No roles assigned. Contact your administrator.
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
          <SystemStatus />
        </div>
      </div>

      {seeAppointments && operational.status === 'success' && operational.data && (
        <Card>
          <CardHeader>
            <CardTitle>Practice performance · last 30 days</CardTitle>
            <CardDescription>Straight from live records; no estimates.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Practice</TH>
                  <TH numeric>Appointments</TH>
                  <TH numeric>Completed</TH>
                  <TH numeric>No-shows</TH>
                  <TH numeric>New patients</TH>
                  {seeFinance && <TH numeric>Payments received</TH>}
                  {seeFinance && <TH numeric>Outstanding</TH>}
                </TR>
              </THead>
              <TBody>
                {operational.data.perPractice.map((p) => {
                  const total = Object.values(p.appointments).reduce((a, b) => a + b, 0);
                  const fin =
                    financial.status === 'success' && financial.data
                      ? financial.data.perPractice.find((x) => x.practiceId === p.practiceId)
                      : undefined;
                  return (
                    <TR key={p.practiceId}>
                      <TD className="font-medium">{practiceName(p.practiceId)}</TD>
                      <TD numeric>{total}</TD>
                      <TD numeric>{p.appointments.COMPLETED ?? 0}</TD>
                      <TD numeric>{p.appointments.NO_SHOW ?? 0}</TD>
                      <TD numeric>{p.newPatients ?? '—'}</TD>
                      {seeFinance && <TD numeric>{fin ? rand(fin.paymentsReceived) : '—'}</TD>}
                      {seeFinance && <TD numeric>{fin ? rand(fin.outstandingInvoices) : '—'}</TD>}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activity.status === 'success' && activity.data && activity.data.data.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>
                Latest audited actions. Never includes clinical content.
              </CardDescription>
            </div>
            <Link href="/audit" className="text-sm font-medium text-primary hover:underline">
              Open audit trail
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {activity.data.data.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{e.action}</span>
                    <span className="text-muted-foreground"> · {e.actorName ?? 'System'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {sastDate(e.occurredAt)} {formatTime(e.occurredAt)}
                    </span>
                    <Badge
                      tone={
                        e.outcome === 'SUCCESS'
                          ? 'success'
                          : e.outcome === 'DENIED'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {e.outcome.toLowerCase()}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SystemStatus() {
  const live = useApi((s) => fetchLiveness(s));
  const ready = useApi((s) => fetchReadiness(s));
  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardDescription>Live checks against the API and database.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="API">
          {live.status === 'loading' ? (
            <Skeleton className="h-5 w-16" />
          ) : live.status === 'error' ? (
            <Badge tone="danger">Unreachable</Badge>
          ) : (
            <Badge tone="success">Online · v{live.data.version}</Badge>
          )}
        </Row>
        <Row label="Database">
          {ready.status === 'loading' ? (
            <Skeleton className="h-5 w-16" />
          ) : ready.status === 'error' ? (
            <Badge tone="warning">Unknown</Badge>
          ) : ready.data.checks.database.status === 'up' ? (
            <Badge tone="success">Connected</Badge>
          ) : (
            <Badge tone="danger">Unavailable</Badge>
          )}
        </Row>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
