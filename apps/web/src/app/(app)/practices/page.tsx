'use client';

import { createPracticeRequestSchema, practiceSchema, paginatedSchema } from '@dpms/contracts';
import { useState, type FormEvent } from 'react';
import { useToast } from '@/components/toast';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { describeError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { useApi } from '@/lib/use-api';

const schema = paginatedSchema(practiceSchema);

export default function PracticesPage() {
  const [page, setPage] = useState(1);
  const { state } = useSession();
  const { notify } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const result = useApi(
    (signal) => apiFetch(`/practices?page=${page}&pageSize=25`, schema, { signal }),
    [page],
  );
  const manage = state.status === 'authenticated' && can(state.user, 'practice.manage');

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const f = new FormData(e.currentTarget);
    const parsed = createPracticeRequestSchema.safeParse({
      name: f.get('name'),
      code: f.get('code'),
    });
    if (!parsed.success)
      return setFormError(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    try {
      await apiFetch('/practices', practiceSchema, { method: 'POST', body: parsed.data });
      notify('success', 'Practice created.');
      setShowForm(false);
      result.reload();
    } catch (err) {
      setFormError(describeError(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Practices</h1>
          <p className="text-sm text-muted-foreground">Practices you are permitted to see.</p>
        </div>
        {manage && (
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Add practice'}
          </Button>
        )}
      </div>
      {showForm && (
        <Card>
          <form onSubmit={create} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field id="name" label="Practice name">
              <Input id="name" name="name" required />
            </Field>
            <Field
              id="code"
              label="Code"
              hint="2–20 characters: A–Z, 0–9, hyphen. Cannot be reused."
            >
              <Input id="code" name="code" required />
            </Field>
            {formError && (
              <p
                role="alert"
                className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2"
              >
                {formError}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit">Create practice</Button>
            </div>
          </form>
        </Card>
      )}
      <Card>
        {result.status === 'loading' && (
          <div className="space-y-3 p-5" aria-busy="true">
            <span className="sr-only">Loading practices</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        )}
        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
        {result.status === 'success' && result.data.data.length === 0 && (
          <EmptyState
            title="No practices yet"
            description="Practice records have not been created, or none are assigned to you. Organisation owners can add practices here."
          />
        )}
        {result.status === 'success' && result.data.data.length > 0 && (
          <>
            <table className="w-full text-sm">
              <caption className="sr-only">Practices</caption>
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Code
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.data.data.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{p.code}</td>
                    <td className="px-5 py-3">
                      <Badge tone={p.isActive ? 'success' : 'neutral'}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
              <span>
                Page {result.data.meta.page} of {Math.max(1, result.data.meta.totalPages)} ·{' '}
                {result.data.meta.total} total
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
