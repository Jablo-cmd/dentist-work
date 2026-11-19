'use client';

import {
  financialSummarySchema,
  operationalSummarySchema,
  paginatedSchema,
  practiceSchema,
} from '@dpms/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { addDays, sastDate } from '@/lib/time';
import { useApi } from '@/lib/use-api';

const rand = (v: string) =>
  `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReportsPage() {
  const { state } = useSession();
  const today = sastDate(new Date());
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [practiceId, setPracticeId] = useState('');
  const practices = useApi((s) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal: s }),
  );
  const qs = `from=${from}&to=${to}${practiceId ? `&practiceId=${practiceId}` : ''}`;
  const user = state.status === 'authenticated' ? state.user : null;
  const financial = useApi(
    async (s) =>
      user && can(user, 'financial_report.read')
        ? apiFetch(`/reports/financial-summary?${qs}`, financialSummarySchema, { signal: s })
        : null,
    [qs, !!user],
  );
  const operational = useApi(
    async (s) =>
      user && can(user, 'appointment.read')
        ? apiFetch(`/reports/operational-summary?${qs}`, operationalSummarySchema, { signal: s })
        : null,
    [qs, !!user],
  );
  if (!user) return null;
  const name = (id: string) =>
    (practices.status === 'success'
      ? practices.data.data.find((p) => p.id === id)?.name
      : undefined) ?? 'Practice';
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Figures come straight from the live records and cover only the practices you are
          authorised for. Maximum range: 366 days.
        </p>
      </div>
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field id="r-from" label="From">
            <Input
              id="r-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </Field>
          <Field id="r-to" label="To">
            <Input
              id="r-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </Field>
          <Field id="r-prac" label="Practice">
            <Select id="r-prac" value={practiceId} onChange={(e) => setPracticeId(e.target.value)}>
              <option value="">All permitted practices</option>
              {practices.status === 'success' &&
                practices.data.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </Card>

      {can(user, 'financial_report.read') && (
        <Card>
          <CardHeader>
            <CardTitle>Financial summary</CardTitle>
          </CardHeader>
          <CardContent>
            {financial.status === 'loading' && <Skeleton className="h-24 w-full" />}
            {financial.status === 'error' && (
              <ErrorState error={financial.error} onRetry={financial.reload} />
            )}
            {financial.status === 'success' &&
              financial.data &&
              (financial.data.perPractice.length === 0 ? (
                <EmptyState
                  title="No data"
                  description="No permitted practices match this filter."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Financial summary by practice</caption>
                    <thead className="border-b text-left text-muted-foreground">
                      <tr>
                        {[
                          'Practice',
                          'Invoiced',
                          'Credited',
                          'Net invoiced',
                          'Payments received',
                          'Outstanding',
                        ].map((h) => (
                          <th key={h} scope="col" className="px-3 py-2 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {financial.data.perPractice.map((r) => (
                        <tr key={r.practiceId}>
                          <th scope="row" className="px-3 py-2 text-left font-medium">
                            {name(r.practiceId)}
                          </th>
                          <td className="px-3 py-2">{rand(r.invoiced)}</td>
                          <td className="px-3 py-2">{rand(r.credited)}</td>
                          <td className="px-3 py-2">{rand(r.netInvoiced)}</td>
                          <td className="px-3 py-2">
                            {rand(r.paymentsReceived)}
                            <span className="block text-xs text-muted-foreground">
                              {Object.entries(r.paymentsByMethod)
                                .map(([m, v]) => `${m.toLowerCase()} ${rand(v)}`)
                                .join(' · ')}
                            </span>
                          </td>
                          <td className="px-3 py-2">{rand(r.outstandingInvoices)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <th scope="row" className="px-3 py-2 text-left">
                          Total
                        </th>
                        <td className="px-3 py-2">{rand(financial.data.totals.invoiced)}</td>
                        <td className="px-3 py-2">{rand(financial.data.totals.credited)}</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">
                          {rand(financial.data.totals.paymentsReceived)}
                        </td>
                        <td className="px-3 py-2">
                          {rand(financial.data.totals.outstandingInvoices)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            <p className="mt-2 text-xs text-muted-foreground">
              Outstanding is the balance of invoices issued up to the end date, as at today. Tax is
              shown as recorded; no VAT logic is applied.
            </p>
          </CardContent>
        </Card>
      )}

      {can(user, 'appointment.read') && (
        <Card>
          <CardHeader>
            <CardTitle>Operational summary</CardTitle>
          </CardHeader>
          <CardContent>
            {operational.status === 'loading' && <Skeleton className="h-24 w-full" />}
            {operational.status === 'error' && (
              <ErrorState error={operational.error} onRetry={operational.reload} />
            )}
            {operational.status === 'success' && operational.data && (
              <table className="w-full text-sm">
                <caption className="sr-only">Operational summary by practice</caption>
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Practice
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Appointments by status
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      New patients
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {operational.data.perPractice.map((r) => (
                    <tr key={r.practiceId}>
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {name(r.practiceId)}
                      </th>
                      <td className="px-3 py-2">
                        {Object.keys(r.appointments).length
                          ? Object.entries(r.appointments)
                              .map(([s, n]) => `${s.toLowerCase().replace('_', ' ')}: ${n}`)
                              .join(' · ')
                          : 'None'}
                      </td>
                      <td className="px-3 py-2">{r.newPatients ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
      <Button variant="outline" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
