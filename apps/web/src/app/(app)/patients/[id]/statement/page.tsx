'use client';

import { patientAccountSchema, patientSchema } from '@dpms/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { buildStatement, fromCents } from '@/lib/statement';
import { sastDate } from '@/lib/time';
import { useApi } from '@/lib/use-api';

const rand = (v: string) =>
  `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function StatementPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useSession();
  const account = useApi(
    (s) => apiFetch(`/patients/${id}/account`, patientAccountSchema, { signal: s }),
    [id],
  );
  const patient = useApi((s) => apiFetch(`/patients/${id}`, patientSchema, { signal: s }), [id]);
  if (state.status !== 'authenticated') return null;
  if (!can(state.user, 'billing.read'))
    return <Card className="p-6">Your role does not include access to billing.</Card>;
  if (account.status === 'loading' || patient.status === 'loading')
    return <Skeleton className="h-96 w-full" aria-busy="true" />;
  if (account.status === 'error')
    return (
      <Card>
        <ErrorState error={account.error} onRetry={account.reload} />
      </Card>
    );
  if (patient.status === 'error')
    return (
      <Card>
        <ErrorState error={patient.error} onRetry={patient.reload} />
      </Card>
    );
  const { rows, balanceCents } = buildStatement(account.data.invoices, account.data.payments);
  const p = patient.data;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 print:hidden">
        <Link
          href={`/patients/${id}/billing`}
          className="inline-flex h-10 items-center text-sm text-primary underline"
        >
          ← Back to billing
        </Link>
        <Button onClick={() => window.print()}>Print / save as PDF</Button>
      </div>
      <article
        aria-label="Account statement"
        className="mx-auto max-w-4xl rounded-lg border bg-white p-8 text-sm text-black shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none"
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-lg font-semibold">{state.user.organisationName}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold uppercase tracking-wide">Account statement</p>
            <p>As at {sastDate(new Date())}</p>
          </div>
        </header>
        <section className="py-4" aria-label="Patient">
          <p className="text-xs uppercase text-gray-600">Account holder</p>
          <p className="font-medium">
            {p.firstName} {p.lastName}
          </p>
        </section>
        <table className="w-full text-left">
          <caption className="sr-only">Statement of account</caption>
          <thead>
            <tr className="border-b text-xs uppercase text-gray-600">
              <th scope="col" className="py-2">
                Date
              </th>
              <th scope="col" className="py-2">
                Reference
              </th>
              <th scope="col" className="py-2">
                Description
              </th>
              <th scope="col" className="py-2 text-right">
                Charges
              </th>
              <th scope="col" className="py-2 text-right">
                Credits / payments
              </th>
              <th scope="col" className="py-2 text-right">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-gray-600">
                  No transactions.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-b align-top">
                <td className="py-2">{r.date}</td>
                <td className="py-2 font-mono">{r.reference}</td>
                <td className="py-2">
                  {r.kind === 'Payment' ? r.description : `${r.kind}: ${r.description}`}
                  {r.note && <span className="block text-xs text-gray-600">{r.note}</span>}
                </td>
                <td className="py-2 text-right">
                  {r.debitCents ? rand(fromCents(r.debitCents)) : ''}
                </td>
                <td className="py-2 text-right">
                  {r.creditCents ? rand(fromCents(r.creditCents)) : ''}
                </td>
                <td className="py-2 text-right">{rand(fromCents(r.balanceCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-right text-base font-semibold" data-testid="statement-balance">
          {balanceCents > 0 ? 'Amount due' : balanceCents < 0 ? 'Account in credit' : 'Balance'}:{' '}
          {rand(fromCents(Math.abs(balanceCents)))}
        </p>
        <footer className="mt-8 border-t pt-3 text-xs text-gray-600">
          Amounts in South African rand (ZAR). Reversed payments are shown for transparency and are
          not counted.
        </footer>
      </article>
    </div>
  );
}
