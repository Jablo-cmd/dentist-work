'use client';

import { auditEventSchema, paginatedSchema } from '@dpms/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { addDays, formatTime, sastDate } from '@/lib/time';
import { useApi } from '@/lib/use-api';

const schema = paginatedSchema(auditEventSchema);
const AREAS = [
  'auth',
  'user',
  'practice',
  'patient',
  'medical_history',
  'allergy',
  'appointment',
  'clinical_record',
  'dental_chart',
  'treatment_plan',
  'imaging',
  'invoice',
  'payment',
  'billing',
  'report',
  'mfa',
  'access',
  'migration',
];
const TONE = { SUCCESS: 'success', DENIED: 'warning', FAILURE: 'danger' } as const;

export default function AuditPage() {
  const { state } = useSession();
  const today = sastDate(new Date());
  const [f, setF] = useState({ action: '', outcome: '', from: addDays(today, -7), to: today });
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (f.action) qs.set('action', f.action);
  if (f.outcome) qs.set('outcome', f.outcome);
  if (f.from) qs.set('from', f.from);
  if (f.to) qs.set('to', f.to);
  const allowed = state.status === 'authenticated' && can(state.user, 'audit.read');
  const result = useApi(
    async (s) => (allowed ? apiFetch(`/audit-events?${qs}`, schema, { signal: s }) : null),
    [qs.toString(), allowed],
  );
  if (state.status !== 'authenticated') return null;
  if (!allowed)
    return (
      <Card>
        <EmptyState
          title="Not available"
          description="Only organisation owners can review the audit trail."
        />
      </Card>
    );
  const set = (k: keyof typeof f, v: string) => {
    setPage(1);
    setF((x) => ({ ...x, [k]: v }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1>
        <p className="text-sm text-muted-foreground">
          Who did what, and when. Entries cannot be edited or deleted, and never contain patient or
          clinical details. Times are SAST.
        </p>
      </div>
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field id="a-area" label="Area">
            <Select id="a-area" value={f.action} onChange={(e) => set('action', e.target.value)}>
              <option value="">All areas</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="a-out" label="Outcome">
            <Select id="a-out" value={f.outcome} onChange={(e) => set('outcome', e.target.value)}>
              <option value="">All</option>
              <option value="SUCCESS">Success</option>
              <option value="DENIED">Denied</option>
              <option value="FAILURE">Failure</option>
            </Select>
          </Field>
          <Field id="a-from" label="From">
            <Input
              id="a-from"
              type="date"
              value={f.from}
              max={f.to || undefined}
              onChange={(e) => set('from', e.target.value)}
            />
          </Field>
          <Field id="a-to" label="To">
            <Input
              id="a-to"
              type="date"
              value={f.to}
              min={f.from || undefined}
              onChange={(e) => set('to', e.target.value)}
            />
          </Field>
        </div>
      </Card>
      <Card>
        {result.status === 'loading' && (
          <div className="space-y-2 p-5" aria-busy="true">
            <span className="sr-only">Loading audit events</span>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        )}
        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
        {result.status === 'success' && result.data && result.data.data.length === 0 && (
          <EmptyState title="No events" description="Nothing matches these filters." />
        )}
        {result.status === 'success' && result.data && result.data.data.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Audit events</caption>
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    {['When', 'Who', 'Action', 'Outcome', 'Reference'].map((h) => (
                      <th key={h} scope="col" className="px-4 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.data.data.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap px-4 py-2">
                        {sastDate(e.occurredAt)} {formatTime(e.occurredAt)}
                      </td>
                      <td className="px-4 py-2">
                        {e.actorName ?? (
                          <span className="text-muted-foreground">system / not signed in</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                      <td className="px-4 py-2">
                        <Badge tone={TONE[e.outcome]}>{e.outcome.toLowerCase()}</Badge>
                      </td>
                      <td
                        className="px-4 py-2 font-mono text-xs text-muted-foreground"
                        title="Quote this when contacting support"
                      >
                        {e.requestId?.slice(0, 8) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                {result.data.meta.total} events · page {result.data.meta.page} of{' '}
                {Math.max(1, result.data.meta.totalPages)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= result.data.meta.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
