'use client';

import { enquiryRequestSchema, enquiryResponseSchema } from '@dpms/contracts';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { BRAND } from '@/lib/brand';

type State =
  | { kind: 'form'; error?: string; fallback?: boolean }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string };

/** Public enquiry form on the sign-in page. Messages are emailed to the operator's enquiry inbox by the API. */
export function EnquiryDialog() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: 'form' });

  function close() {
    setOpen(false);
    // reset after the dialog is gone so the next opening starts clean
    setTimeout(() => setState({ kind: 'form' }), 200);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = enquiryRequestSchema.safeParse({
      name: f.get('name'),
      email: f.get('email'),
      organisation: String(f.get('organisation') ?? '').trim() || undefined,
      message: f.get('message'),
      website: f.get('website') ?? '',
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = String(first?.path[0] ?? '');
      const msg: Record<string, string> = {
        name: 'Please enter your name.',
        email: 'Please enter a valid email address.',
        message: 'Please write a short message (at least 10 characters).',
        organisation: 'Please check the organisation name.',
      };
      return setState({
        kind: 'form',
        error: msg[field] ?? 'Please check the form and try again.',
      });
    }
    setState({ kind: 'sending' });
    try {
      await apiFetch('/enquiries', enquiryResponseSchema, { method: 'POST', body: parsed.data });
      setState({ kind: 'sent', email: parsed.data.email });
    } catch (err) {
      const limited = err instanceof ApiRequestError && err.code === 'RATE_LIMITED';
      setState({
        kind: 'form',
        fallback: true,
        error: limited
          ? 'Too many enquiries from your connection. Please try again later, or email us directly.'
          : 'Your enquiry could not be sent right now. Please email us directly.',
      });
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" aria-hidden /> Send an enquiry
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Enquire about Nexus"
        description="Tell us about your practice and we will get back to you."
      >
        {state.kind === 'sent' ? (
          <div className="space-y-4 text-center" role="status">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
            <p className="font-medium">Thank you. Your enquiry has been sent.</p>
            <p className="text-sm text-muted-foreground">
              We will reply to <span className="font-medium text-foreground">{state.email}</span>.
            </p>
            <Button onClick={close}>Close</Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field id="enq-name" label="Your name">
              <Input id="enq-name" name="name" autoComplete="name" required maxLength={100} />
            </Field>
            <Field id="enq-email" label="Email address">
              <Input id="enq-email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field id="enq-org" label="Practice or company (optional)">
              <Input id="enq-org" name="organisation" autoComplete="organization" maxLength={120} />
            </Field>
            <Field id="enq-message" label="Message">
              <textarea
                id="enq-message"
                name="message"
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                className="w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm shadow-[inset_0_1px_2px_hsl(154_30%_20%/0.05)] placeholder:text-muted-foreground/70 hover:border-foreground/40 focus-visible:border-brand focus-visible:ring-brand/30 focus-visible:ring-offset-0"
              />
            </Field>
            {/* Honeypot: invisible to people and assistive tech; bots tend to fill it. */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {state.kind === 'form' && state.error && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                {state.error}{' '}
                {state.fallback && (
                  <a className="font-medium underline" href={`mailto:${BRAND.enquiryEmail}`}>
                    {BRAND.enquiryEmail}
                  </a>
                )}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={state.kind === 'sending'}>
                {state.kind === 'sending' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…
                  </>
                ) : (
                  'Send enquiry'
                )}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
