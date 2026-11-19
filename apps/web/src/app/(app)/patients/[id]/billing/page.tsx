'use client';

import {
  PAYMENT_METHODS,
  createCreditNoteRequestSchema,
  createInvoiceRequestSchema,
  invoiceSchema,
  paginatedSchema,
  patientAccountSchema,
  paymentSchema,
  practiceSchema,
  recordPaymentRequestSchema,
  type Invoice,
} from '@dpms/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { useToast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { formValues } from '@/lib/form';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const rand = (v: string) =>
  `R ${Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const human = (s: string) => s.toLowerCase().replace(/_/g, ' ');
type Line = { description: string; quantity: string; unitPrice: string; taxAmount: string };
const blank = (): Line => ({ description: '', quantity: '1', unitPrice: '', taxAmount: '0' });

export default function BillingPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useSession();
  const { notify } = useToast();
  const account = useApi(
    (s) => apiFetch(`/patients/${id}/account`, patientAccountSchema, { signal: s }),
    [id],
  );
  const practices = useApi((s) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal: s }),
  );
  if (state.status !== 'authenticated') return null;
  const user = state.user;
  if (!can(user, 'billing.read'))
    return (
      <Card>
        <EmptyState
          title="Not available"
          description="Your role does not include access to billing."
        />
      </Card>
    );
  const manage = can(user, 'billing.manage');
  const canPay = can(user, 'payment.record');

  async function act(path: string, body: object | undefined, ok: string) {
    try {
      await apiFetch(path, null, { method: 'POST', body: body ?? {} });
      notify('success', ok);
      account.reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/patients/${id}`} className="text-sm text-primary underline">
          ← Patient details
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Billing and account</h1>
        <p className="text-sm text-muted-foreground">
          Posted invoices and payments are permanent. Corrections are made with credit notes and
          payment reversals.
        </p>
      </div>
      {account.status === 'loading' && <Skeleton className="h-32 w-full" />}
      {account.status === 'error' && (
        <Card>
          <ErrorState error={account.error} onRetry={account.reload} />
        </Card>
      )}
      {account.status === 'success' && (
        <>
          <Card>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="text-2xl font-semibold">{rand(account.data.balance)}</p>
                <p className="text-xs text-muted-foreground">
                  {Number(account.data.balance) < 0
                    ? 'Patient is in credit'
                    : Number(account.data.balance) > 0
                      ? 'Patient owes'
                      : 'Settled'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Invoices outstanding</p>
                <p className="text-lg font-medium">{rand(account.data.outstandingInvoices)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Payments on account</p>
                <p className="text-lg font-medium">{rand(account.data.unallocatedPayments)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {account.data.invoices.length === 0 && (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              )}
              <ul className="divide-y rounded-md border text-sm">
                {account.data.invoices.map((i) => (
                  <InvoiceRow key={i.id} inv={i} manage={manage} onAct={act} />
                ))}
              </ul>
              {manage && practices.status === 'success' && (
                <NewInvoice
                  patientId={id}
                  practices={practices.data.data.filter((p) => p.isActive)}
                  onDone={account.reload}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {account.data.payments.length === 0 && (
                <p className="text-sm text-muted-foreground">No payments recorded.</p>
              )}
              <ul className="divide-y text-sm">
                {account.data.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {p.receivedOn} · {human(p.method)} · <strong>{rand(p.amount)}</strong>
                      {p.reference ? ` · ${p.reference}` : ''} · unallocated {rand(p.unallocated)}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={p.status === 'REVERSED' ? 'danger' : 'success'}>
                        {human(p.status)}
                      </Badge>
                      {p.status === 'RECORDED' && manage && canPay && (
                        <ReverseButton paymentId={p.id} onAct={act} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {canPay && practices.status === 'success' && (
                <NewPayment
                  patientId={id}
                  practices={practices.data.data.filter((p) => p.isActive)}
                  openInvoices={account.data.invoices.filter(
                    (i) =>
                      i.kind === 'INVOICE' && i.status === 'POSTED' && Number(i.outstanding) > 0,
                  )}
                  onDone={account.reload}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ReverseButton({
  paymentId,
  onAct,
}: {
  paymentId: string;
  onAct: (path: string, body: object, ok: string) => Promise<void>;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        const reason = window.prompt('Reason for reversing this payment (kept permanently):');
        if (reason && reason.trim().length >= 5)
          void onAct(
            `/payments/${paymentId}/reverse`,
            { reason: reason.trim() },
            'Payment reversed.',
          );
      }}
    >
      Reverse
    </Button>
  );
}

function InvoiceRow({
  inv,
  manage,
  onAct,
}: {
  inv: Invoice;
  manage: boolean;
  onAct: (path: string, body: object | undefined, ok: string) => Promise<void>;
}) {
  const { notify } = useToast();
  const [credit, setCredit] = useState(false);
  const isCn = inv.kind === 'CREDIT_NOTE';
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">{inv.number ?? 'Draft'}</span>{' '}
          {isCn && <Badge>credit note</Badge>} · {inv.issueDate ?? 'not issued'} · total{' '}
          <strong>{rand(inv.total)}</strong>
          {inv.status === 'POSTED' && !isCn ? ` · outstanding ${rand(inv.outstanding)}` : ''}
        </span>
        <Badge
          tone={
            inv.status === 'POSTED' ? 'success' : inv.status === 'CANCELLED' ? 'danger' : 'warning'
          }
        >
          {inv.status.toLowerCase()}
        </Badge>
      </div>
      <ul className="text-muted-foreground">
        {inv.lines.map((l) => (
          <li key={l.id}>
            {l.description} — {l.quantity} × {rand(l.unitPrice)}
            {Number(l.taxAmount) > 0 ? ` + tax ${rand(l.taxAmount)}` : ''}
          </li>
        ))}
      </ul>
      {inv.reason && <p className="text-xs">Reason: {inv.reason}</p>}
      {manage && inv.status === 'DRAFT' && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (
                window.confirm(
                  'Post this invoice? It will be numbered and can no longer be edited.',
                )
              )
                void onAct(`/invoices/${inv.id}/post`, undefined, 'Invoice posted.');
            }}
          >
            Post invoice
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void onAct(`/invoices/${inv.id}/discard`, undefined, 'Draft discarded.')}
          >
            Discard draft
          </Button>
        </div>
      )}
      {manage && inv.status === 'POSTED' && !isCn && (
        <>
          <Button size="sm" variant="outline" onClick={() => setCredit((v) => !v)}>
            Issue credit note
          </Button>
          {credit && (
            <form
              className="grid gap-2 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = formValues(e.currentTarget);
                const parsed = createCreditNoteRequestSchema.safeParse({
                  reason: f.reason,
                  lines: [{ description: f.description, unitPrice: f.unitPrice }],
                });
                if (!parsed.success)
                  return notify('error', parsed.error.issues.map((x) => x.message).join('; '));
                void onAct(
                  `/invoices/${inv.id}/credit-notes`,
                  parsed.data,
                  'Credit note issued.',
                ).then(() => setCredit(false));
              }}
            >
              <Field id={`cr-${inv.id}`} label="Reason">
                <Input id={`cr-${inv.id}`} name="reason" required minLength={5} />
              </Field>
              <Field id={`cd-${inv.id}`} label="Credit description">
                <Input id={`cd-${inv.id}`} name="description" required />
              </Field>
              <Field id={`ca-${inv.id}`} label="Amount (R)">
                <Input id={`ca-${inv.id}`} name="unitPrice" inputMode="decimal" required />
              </Field>
              <div>
                <Button size="sm" type="submit">
                  Issue
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </li>
  );
}

function NewInvoice({
  patientId,
  practices,
  onDone,
}: {
  patientId: string;
  practices: { id: string; name: string }[];
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, k: keyof Line, v: string) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const parsed = createInvoiceRequestSchema.safeParse({
      practiceId: formValues(e.currentTarget).practiceId,
      lines,
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    try {
      await apiFetch(`/patients/${patientId}/invoices`, invoiceSchema, {
        method: 'POST',
        body: parsed.data,
      });
      notify('success', 'Draft invoice created. Review it, then post.');
      setLines([blank()]);
      onDone();
    } catch (err) {
      setError(describeError(err));
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold">New draft invoice</h3>
      <Field id="inv-practice" label="Practice">
        <Select id="inv-practice" name="practiceId">
          {practices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      {lines.map((l, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <Field id={`l-d-${i}`} label="Description">
            <Input
              id={`l-d-${i}`}
              value={l.description}
              onChange={(e) => set(i, 'description', e.target.value)}
              required
            />
          </Field>
          <Field id={`l-q-${i}`} label="Qty">
            <Input
              id={`l-q-${i}`}
              inputMode="decimal"
              value={l.quantity}
              onChange={(e) => set(i, 'quantity', e.target.value)}
              required
            />
          </Field>
          <Field id={`l-p-${i}`} label="Unit price (R)">
            <Input
              id={`l-p-${i}`}
              inputMode="decimal"
              value={l.unitPrice}
              onChange={(e) => set(i, 'unitPrice', e.target.value)}
              required
            />
          </Field>
          <Field id={`l-t-${i}`} label="Tax amount (R)" hint="Entered, not calculated">
            <Input
              id={`l-t-${i}`}
              inputMode="decimal"
              value={l.taxAmount}
              onChange={(e) => set(i, 'taxAmount', e.target.value)}
            />
          </Field>
        </div>
      ))}
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setLines((ls) => [...ls, blank()])}
        >
          Add line
        </Button>
        <Button type="submit" size="sm">
          Create draft
        </Button>
      </div>
    </form>
  );
}

function NewPayment({
  patientId,
  practices,
  openInvoices,
  onDone,
}: {
  patientId: string;
  practices: { id: string; name: string }[];
  openInvoices: Invoice[];
  onDone: () => void;
}) {
  const { notify } = useToast();
  // One key per form "attempt": a retry after a network failure re-sends the same key, so it can never double-post.
  const key = useRef(crypto.randomUUID().replace(/-/g, ''));
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const f = formValues(form);
    const parsed = recordPaymentRequestSchema.safeParse({
      practiceId: f.practiceId,
      amount: f.amount,
      method: f.method,
      reference: f.reference || null,
      allocations: f.invoiceId ? [{ invoiceId: f.invoiceId, amount: f.allocate || f.amount }] : [],
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    try {
      await apiFetch(`/patients/${patientId}/payments`, paymentSchema, {
        method: 'POST',
        body: parsed.data,
        headers: { 'Idempotency-Key': key.current },
      });
      notify('success', 'Payment recorded.');
      key.current = crypto.randomUUID().replace(/-/g, '');
      form.reset();
      onDone();
    } catch (err) {
      setError(describeError(err));
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 border-t pt-4 sm:grid-cols-2">
      <h3 className="text-sm font-semibold sm:col-span-2">Record payment</h3>
      <Field id="pay-practice" label="Practice">
        <Select id="pay-practice" name="practiceId">
          {practices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="pay-method" label="Method">
        <Select id="pay-method" name="method">
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {human(m)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="pay-amount" label="Amount (R)">
        <Input id="pay-amount" name="amount" inputMode="decimal" required />
      </Field>
      <Field id="pay-ref" label="Reference">
        <Input id="pay-ref" name="reference" maxLength={100} />
      </Field>
      <Field id="pay-inv" label="Apply to invoice (optional)">
        <Select id="pay-inv" name="invoiceId">
          <option value="">Keep on account</option>
          {openInvoices.map((i) => (
            <option key={i.id} value={i.id}>
              {i.number} — outstanding {rand(i.outstanding)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="pay-alloc" label="Amount to apply (defaults to full payment)">
        <Input id="pay-alloc" name="allocate" inputMode="decimal" />
      </Field>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2"
        >
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" size="sm">
          Record payment
        </Button>
      </div>
    </form>
  );
}
