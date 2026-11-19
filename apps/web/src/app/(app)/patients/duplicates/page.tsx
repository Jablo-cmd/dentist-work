'use client';

import { duplicateFlagSchema, paginatedSchema, type DuplicateFlag } from '@dpms/contracts';
import Link from 'next/link';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useApi } from '@/lib/use-api';

const schema = paginatedSchema(duplicateFlagSchema);

export default function DuplicatesPage() {
  const { notify } = useToast();
  const result = useApi((signal) =>
    apiFetch('/patients/duplicates?status=PENDING&pageSize=50', schema, { signal }),
  );

  async function decide(f: DuplicateFlag, decision: 'DISTINCT_PATIENTS' | 'CONFIRMED_DUPLICATE') {
    try {
      await apiFetch(`/patients/duplicates/${f.id}/review`, null, {
        method: 'POST',
        body: { decision },
      });
      notify(
        'success',
        decision === 'DISTINCT_PATIENTS'
          ? 'Marked as different people.'
          : 'Recorded as duplicate. Record merging is not yet available — keep using the existing record.',
      );
      result.reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Duplicate review</h1>
        <p className="text-sm text-muted-foreground">
          Uncertain matches are never merged automatically. Compare the records, then record your
          decision.
        </p>
      </div>
      <Card>
        {result.status === 'loading' && (
          <div className="p-5" aria-busy="true">
            <Skeleton className="h-16 w-full" />
          </div>
        )}
        {result.status === 'error' && <ErrorState error={result.error} onRetry={result.reload} />}
        {result.status === 'success' && result.data.data.length === 0 && (
          <EmptyState
            title="Nothing to review"
            description="There are no pending duplicate candidates in your practices."
          />
        )}
        {result.status === 'success' && result.data.data.length > 0 && (
          <ul className="divide-y">
            {result.data.data.map((f) => (
              <li key={f.id} className="space-y-2 px-5 py-4 text-sm">
                <p className="text-muted-foreground">{f.reasons.join('; ')}</p>
                <div className="flex flex-wrap gap-4">
                  {[f.patientA, f.patientB].map((p) => (
                    <Link
                      key={p.id}
                      href={`/patients/${p.id}`}
                      className="font-medium text-primary underline"
                    >
                      {p.lastName}, {p.firstName} · born {p.dateOfBirth}
                    </Link>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void decide(f, 'DISTINCT_PATIENTS')}
                  >
                    Different people
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void decide(f, 'CONFIRMED_DUPLICATE')}
                  >
                    Same person
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
