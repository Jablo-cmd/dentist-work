'use client';

import {
  mfaConfirmResponseSchema,
  mfaDisableRequestSchema,
  mfaEnrolResponseSchema,
  type MfaEnrolResponse,
} from '@dpms/contracts';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { useToast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { apiFetch, ApiRequestError } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { formValues } from '@/lib/form';
import { useSession } from '@/lib/session';

export default function SecurityPage() {
  const { state, refresh } = useSession();
  const { notify } = useToast();
  const [enrol, setEnrol] = useState<MfaEnrolResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!enrol) return setQr(null);
    // Generated in the browser: the secret is never sent to a third-party QR service.
    void QRCode.toDataURL(enrol.otpauthUri, { margin: 1, width: 192 }).then(setQr);
  }, [enrol]);

  if (state.status !== 'authenticated') return null;
  const { user } = state;

  async function start() {
    setError(null);
    try {
      setEnrol(
        await apiFetch('/auth/mfa/enrol', mfaEnrolResponseSchema, { method: 'POST', body: {} }),
      );
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 503) setUnavailable(true);
      else setError(describeError(err));
    }
  }

  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      const r = await apiFetch('/auth/mfa/confirm', mfaConfirmResponseSchema, {
        method: 'POST',
        body: { code: formValues(e.currentTarget).code },
      });
      setRecovery(r.recoveryCodes);
      setEnrol(null);
      await refresh();
      notify('success', 'Two-factor authentication is now on.');
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'MFA_INVALID'
          ? 'That code was not accepted. Check the time on your phone and try again.'
          : describeError(err),
      );
    }
  }

  async function disable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const parsed = mfaDisableRequestSchema.safeParse(formValues(e.currentTarget));
    if (!parsed.success) return setError('Enter your password and the current 6-digit code.');
    try {
      await apiFetch('/auth/mfa/disable', null, { method: 'POST', body: parsed.data });
      await refresh();
      notify('success', 'Two-factor authentication turned off.');
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'MFA_INVALID'
          ? 'Password or code was not accepted.'
          : describeError(err),
      );
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
      {user.mfaEnrolmentRequired && (
        <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Your role requires two-factor authentication. Set it up to continue.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Authenticator app{' '}
            <Badge tone={user.mfaEnabled ? 'success' : 'neutral'}>
              {user.mfaEnabled ? 'on' : 'off'}
            </Badge>
          </CardTitle>
          <CardDescription>
            A second step at sign-in using an app such as Microsoft Authenticator, Google
            Authenticator or 1Password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {unavailable && (
            <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
              Two-factor authentication is not enabled on this server yet. Ask your administrator.
            </p>
          )}

          {recovery && (
            <div className="space-y-2 rounded-md border border-warning/50 bg-warning-soft p-4">
              <p className="text-sm font-semibold">Save your recovery codes now</p>
              <p className="text-sm">
                Each code works once if you lose your phone. They will not be shown again. Store
                them somewhere safe and offline.
              </p>
              <ul className="grid grid-cols-2 gap-1 font-mono text-sm" aria-label="Recovery codes">
                {recovery.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <Button size="sm" variant="outline" onClick={() => setRecovery(null)}>
                I have saved them
              </Button>
            </div>
          )}

          {!user.mfaEnabled && !enrol && !recovery && (
            <Button onClick={() => void start()}>Set up authenticator</Button>
          )}

          {enrol && (
            <form onSubmit={confirm} className="space-y-3">
              <p className="text-sm">
                1. Scan this code with your authenticator app (or enter the key manually).
              </p>
              {qr && (
                <img
                  src={qr}
                  alt="QR code for your authenticator app"
                  width={192}
                  height={192}
                  className="rounded-md border"
                />
              )}
              <p
                className="break-all rounded-md bg-muted p-2 font-mono text-xs"
                aria-label="Manual entry key"
              >
                {enrol.secret}
              </p>
              <p className="text-sm">2. Enter the 6-digit code the app shows.</p>
              <Field id="mfa-code" label="Code">
                <Input
                  id="mfa-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                />
              </Field>
              <Button type="submit">Confirm and turn on</Button>
            </form>
          )}

          {user.mfaEnabled && (
            <form onSubmit={disable} className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold">Turn off</h3>
              <Field id="d-pw" label="Password">
                <Input
                  id="d-pw"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Field id="d-code" label="Current authenticator code">
                <Input id="d-code" name="code" inputMode="numeric" maxLength={6} required />
              </Field>
              <Button type="submit" variant="outline">
                Turn off two-factor
              </Button>
            </form>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
