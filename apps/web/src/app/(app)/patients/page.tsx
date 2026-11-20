'use client';

import { paginatedSchema, patientSearchResultSchema, practiceSchema } from '@dpms/contracts';
import { Search, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const schema = paginatedSchema(patientSearchResultSchema);

/** Whole years between an ISO date (YYYY-MM-DD) and today. */
function ageOf(dob: string): number {
  const d = new Date(`${dob}T12:00:00Z`);
  const n = new Date();
  let age = n.getUTCFullYear() - d.getUTCFullYear();
  if (
    n.getUTCMonth() < d.getUTCMonth() ||
    (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())
  )
    age--;
  return age;
}

export default function PatientsPage() {
  const { state } = useSession();
  const [criteria, setCriteria] = useState<{ q: string; dob: string } | null>(null);
  const [page, setPage] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);
  const practices = useApi((s) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal: s }),
  );

  const result = useApi(
    async (signal) => {
      if (!criteria) return null;
      const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (criteria.q) qs.set('q', criteria.q);
      if (criteria.dob) qs.set('dateOfBirth', criteria.dob);
      return apiFetch(`/patients?${qs}`, schema, { signal });
    },
    [criteria, page],
  );

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = String(f.get('q') ?? '').trim();
    const dob = String(f.get('dob') ?? '');
    if (q.length < 2 && !dob)
      return setFormError(
        'Enter at least 2 characters of a name or phone/ID number, or a date of birth.',
      );
    setFormError(null);
    setPage(1);
    setCriteria({ q, dob });
  }

  const canCreate = state.status === 'authenticated' && can(state.user, 'patient.create');
  const practiceName = (id: string) =>
    practices.status === 'success'
      ? (practices.data.data.find((p) => p.id === id)?.name ?? 'Practice')
      : '…';
  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        description="Search is required — patient lists are never shown in bulk. Every search and view is audited."
        actions={
          canCreate && (
            <Link href="/patients/new" className={buttonVariants()}>
              <UserPlus className="h-4 w-4" aria-hidden /> Register patient
            </Link>
          )
        }
      />
      <Card>
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3 p-5" role="search">
          <div className="min-w-56 flex-1">
            <Field id="q" label="Name, phone or ID number">
              <Input id="q" name="q" autoComplete="off" placeholder="e.g. Smith, or 082 000 0000" />
            </Field>
          </div>
          <Field id="dob" label="Date of birth">
            <Input id="dob" name="dob" type="date" />
          </Field>
          <Button type="submit">
            <Search className="h-4 w-4" aria-hidden /> Search
          </Button>
        </form>
        {formError && (
          <p
            role="alert"
            className="mx-5 mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        )}
      </Card>
      {!criteria && (
        <Card>
          <EmptyState
            title="Search for a patient"
            description="Enter a name, phone number or ID number, or a date of birth, to find a patient record."
          />
        </Card>
      )}
      {criteria && (
        <Card className="overflow-hidden">
          {result.status === 'loading' && (
            <div className="space-y-3 p-5" aria-busy="true">
              <span className="sr-only">Searching</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          )}
          {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
          {result.status === 'success' && result.data && result.data.data.length === 0 && (
            <EmptyState
              title="No matching patients"
              description="Check the spelling, or register a new patient if they are not on the system."
            />
          )}
          {result.status === 'success' && result.data && result.data.data.length > 0 && (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Patient</TH>
                    <TH>Date of birth</TH>
                    <TH className="hidden sm:table-cell">Mobile</TH>
                    <TH className="hidden md:table-cell">Practice</TH>
                  </TR>
                </THead>
                <TBody>
                  {result.data.data.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <Link
                          href={`/patients/${p.id}`}
                          className="flex items-center gap-3 font-medium text-foreground hover:text-primary"
                        >
                          <span
                            aria-hidden
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                          >
                            {(p.firstName[0] ?? '') + (p.lastName[0] ?? '')}
                          </span>
                          <span>
                            {p.lastName}, {p.firstName}
                          </span>
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {p.dateOfBirth} · {ageOf(p.dateOfBirth)} yrs
                      </TD>
                      <TD className="hidden whitespace-nowrap sm:table-cell">
                        {p.mobilePhone ?? <span className="text-muted-foreground">—</span>}
                      </TD>
                      <TD className="hidden md:table-cell">
                        <span className="flex flex-wrap gap-1">
                          {p.practiceIds.map((id) => (
                            <Badge key={id} tone="brand">
                              {practiceName(id)}
                            </Badge>
                          ))}
                        </span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-sm text-muted-foreground">
                <span>
                  {result.data.meta.total} found · page {result.data.meta.page} of{' '}
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
      )}
    </div>
  );
}
