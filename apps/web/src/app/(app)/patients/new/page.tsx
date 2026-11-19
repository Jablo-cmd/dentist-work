'use client';

import {
  createPatientRequestSchema,
  createPatientResponseSchema,
  paginatedSchema,
  practiceSchema,
  type CreatePatientResponse,
} from '@dpms/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useToast } from '@/components/toast';
import { PatientFields } from '@/components/patient-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { formValues } from '@/lib/form';
import { useApi } from '@/lib/use-api';

export default function NewPatientPage() {
  const { notify } = useToast();
  const practices = useApi((signal) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal }),
  );
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatePatientResponse | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const parsed = createPatientRequestSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success)
      return setError(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    setPending(true);
    try {
      const res = await apiFetch('/patients', createPatientResponseSchema, {
        method: 'POST',
        body: parsed.data,
      });
      notify('success', 'Patient registered.');
      setCreated(res);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Patient registered</h1>
        {created.duplicateCandidates.length > 0 && (
          <Card className="border-warning/50">
            <CardHeader>
              <CardTitle>
                Possible duplicate{created.duplicateCandidates.length > 1 ? 's' : ''} found
              </CardTitle>
              <CardDescription>
                Nothing was merged. Please check whether this is the same person; a reviewer will
                confirm in the duplicate review queue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {created.duplicateCandidates.map((c) => (
                  <li key={c.id} className="py-2">
                    <Link className="font-medium text-primary underline" href={`/patients/${c.id}`}>
                      {c.lastName}, {c.firstName} (born {c.dateOfBirth})
                    </Link>
                    <span className="ml-2 text-muted-foreground">{c.reasons.join('; ')}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        <Link
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          href={`/patients/${created.patient.id}`}
        >
          Open patient record
        </Link>
      </div>
    );
  }
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Register patient</h1>
      <p className="text-sm text-muted-foreground">
        Search first to avoid creating a duplicate record.
      </p>
      <Card>
        <CardContent className="pt-5">
          {practices.status === 'error' && (
            <ErrorState error={practices.error} onRetry={practices.reload} />
          )}
          {practices.status === 'success' && (
            <form onSubmit={onSubmit} className="space-y-4">
              <PatientFields practices={practices.data.data} />
              {error && (
                <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Register patient'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
