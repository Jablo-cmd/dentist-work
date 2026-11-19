'use client';

import { paginatedSchema, patientSummarySchema } from '@dpms/contracts';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const schema = paginatedSchema(patientSummarySchema);

export default function PatientsPage() {
  const { state } = useSession();
  const [criteria, setCriteria] = useState<{ q: string; dob: string } | null>(null);
  const [page, setPage] = useState(1);
  const [formError, setFormError] = useState<string | null>(null);

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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">
            Search is required — patient lists are never shown in bulk. Every search and view is
            audited.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/patients/new"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Register patient
          </Link>
        )}
      </div>
      <Card>
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3 p-5" role="search">
          <div className="min-w-56 flex-1">
            <Field id="q" label="Name, phone or ID number">
              <Input id="q" name="q" autoComplete="off" />
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
      {criteria && (
        <Card>
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
              <ul className="divide-y">
                {result.data.data.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/patients/${p.id}`}
                      className="flex items-center justify-between px-5 py-3 text-sm hover:bg-muted"
                    >
                      <span className="font-medium">
                        {p.lastName}, {p.firstName}
                      </span>
                      <span className="text-muted-foreground">Born {p.dateOfBirth}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
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
