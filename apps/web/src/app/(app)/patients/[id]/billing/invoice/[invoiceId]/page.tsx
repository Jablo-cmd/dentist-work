'use client';

import { invoiceSchema, patientSchema, practiceSchema } from '@dpms/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const rand = (v: string) =>
  `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PrintableInvoice() {
  const { id, invoiceId } = useParams<{ id: string; invoiceId: string }>();
  const { state } = useSession();
  const invoice = useApi(
    (s) => apiFetch(`/invoices/${invoiceId}`, invoiceSchema, { signal: s }),
    [invoiceId],
  );
  const patient = useApi((s) => apiFetch(`/patients/${id}`, patientSchema, { signal: s }), [id]);
  const practice = useApi(
    async (s) =>
      invoice.status === 'success'
        ? apiFetch(`/practices/${invoice.data.practiceId}`, practiceSchema, { signal: s })
        : null,
    [invoice.status],
  );
  if (state.status !== 'authenticated') return null;
  if (!can(state.user, 'billing.read'))
    return <Card className="p-6">Your role does not include access to billing.</Card>;
  if (invoice.status === 'loading' || patient.status === 'loading')
    return <Skeleton className="h-96 w-full" aria-busy="true" />;
  if (invoice.status === 'error')
    return (
      <Card>
        <ErrorState error={invoice.error} onRetry={invoice.reload} />
      </Card>
    );
  if (patient.status === 'error')
    return (
      <Card>
        <ErrorState error={patient.error} onRetry={patient.reload} />
      </Card>
    );
  const inv = invoice.data;
  const p = patient.data;
  const title =
    inv.kind === 'CREDIT_NOTE'
      ? 'Credit note'
      : inv.status === 'POSTED'
        ? 'Invoice'
        : 'Draft invoice (not issued)';
  const address = [p.addressLine1, p.addressLine2, p.suburb, p.city, p.postalCode].filter(Boolean);

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
        aria-label={`${title} ${inv.number ?? ''}`}
        className="mx-auto max-w-3xl rounded-lg border bg-white p-8 text-sm text-black shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none"
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-lg font-semibold">{state.user.organisationName}</p>
            <p>{practice.status === 'success' && practice.data ? practice.data.name : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold uppercase tracking-wide">{title}</p>
            <p className="font-mono">{inv.number ?? '—'}</p>
            <p>Date: {inv.issueDate ?? '—'}</p>
          </div>
        </header>
        <section className="grid gap-4 py-4 sm:grid-cols-2" aria-label="Patient">
          <div>
            <p className="text-xs uppercase text-gray-600">Billed to</p>
            <p className="font-medium">
              {p.firstName} {p.lastName}
            </p>
            {address.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
          {inv.kind === 'CREDIT_NOTE' && inv.reason && (
            <div>
              <p className="text-xs uppercase text-gray-600">Reason for credit</p>
              <p>{inv.reason}</p>
            </div>
          )}
        </section>
        <table className="w-full border-t text-left">
          <caption className="sr-only">Line items</caption>
          <thead>
            <tr className="border-b text-xs uppercase text-gray-600">
              <th scope="col" className="py-2">
                Description
              </th>
              <th scope="col" className="py-2 text-right">
                Qty
              </th>
              <th scope="col" className="py-2 text-right">
                Unit price
              </th>
              <th scope="col" className="py-2 text-right">
                Tax
              </th>
              <th scope="col" className="py-2 text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="py-2">{l.description}</td>
                <td className="py-2 text-right">{l.quantity}</td>
                <td className="py-2 text-right">{rand(l.unitPrice)}</td>
                <td className="py-2 text-right">{rand(l.taxAmount)}</td>
                <td className="py-2 text-right">{rand(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto mt-4 w-64 space-y-1">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{rand(inv.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax (as recorded)</dt>
            <dd>{rand(inv.taxTotal)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <dt>Total</dt>
            <dd>{rand(inv.total)}</dd>
          </div>
          {inv.kind === 'INVOICE' && inv.status === 'POSTED' && (
            <>
              <div className="flex justify-between">
                <dt>Paid</dt>
                <dd>{rand(inv.amountPaid)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Credited</dt>
                <dd>{rand(inv.amountCredited)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Amount due</dt>
                <dd>{rand(inv.outstanding)}</dd>
              </div>
            </>
          )}
        </dl>
        <footer className="mt-8 border-t pt-3 text-xs text-gray-600">
          Amounts in South African rand (ZAR). This layout is a working default: legal tax-invoice
          wording, VAT details and banking information are pending confirmation by the practice's
          accountant.
        </footer>
      </article>
    </div>
  );
}
