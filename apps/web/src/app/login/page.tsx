'use client';

import { loginRequestSchema } from '@dpms/contracts';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AppFooter } from '@/components/app-footer';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { useSession } from '@/lib/session';

export default function LoginPage() {
  const { login, verifyMfa } = useSession();
  const [challenge, setChallenge] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const value = String(new FormData(e.currentTarget).get('code') ?? '').trim();
    if (!challenge) return;
    setPending(true);
    try {
      await verifyMfa({ challenge, ...(useRecovery ? { recoveryCode: value } : { code: value }) });
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'RATE_LIMITED')
        setError('Too many attempts. Please wait a minute and try again.');
      else if (err instanceof ApiRequestError && err.status === 400)
        setError(
          useRecovery
            ? 'Enter the recovery code in the form xxxx-xxxx-xxxx-xxxx.'
            : 'Enter the 6-digit code from your authenticator app.',
        );
      else {
        setError(
          'That code was not accepted, or it has expired. Check your authenticator app and try again, or sign in again.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const parsed = loginRequestSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setError('Enter a valid email address and your password.');
      return;
    }
    setPending(true);
    try {
      const r = await login(parsed.data);
      if (r.mfaChallenge) {
        setChallenge(r.mfaChallenge);
        return;
      }
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'RATE_LIMITED'
          ? 'Too many attempts. Please wait a minute and try again.'
          : err instanceof ApiRequestError && err.code === 'INVALID_CREDENTIALS'
            ? 'Invalid email or password.'
            : 'Sign-in failed. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[5fr_4fr]">
      <div
        aria-hidden
        className="relative hidden overflow-hidden bg-gradient-to-br from-forest via-forest to-[hsl(156_58%_11%)] lg:block"
      >
        {/* decorative only: soft concentric rings and a large monogram, no text */}
        <svg viewBox="0 0 600 800" className="absolute inset-0 h-full w-full" fill="none">
          <g stroke="hsl(153 63% 37%)" strokeOpacity="0.22">
            <circle cx="470" cy="180" r="120" />
            <circle cx="470" cy="180" r="210" />
            <circle cx="470" cy="180" r="300" />
            <circle cx="470" cy="180" r="390" />
            <circle cx="470" cy="180" r="480" />
          </g>
          <circle cx="470" cy="180" r="120" fill="hsl(153 63% 37%)" fillOpacity="0.08" />
        </svg>
        <div className="absolute bottom-16 left-16">
          <BrandMark className="h-24 w-24 shadow-pop" />
          <div className="mt-8 h-1 w-16 rounded-full bg-brand" />
        </div>
      </div>
      <div className="flex min-h-screen flex-col">
        <main id="main" className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-8">
            <div className="flex flex-col gap-4">
              <BrandMark className="h-11 w-11 lg:hidden" />
              <div>
                <h1 className="text-3xl font-semibold text-forest">{BRAND.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{BRAND.description}</p>
              </div>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Sign in</CardTitle>
                <CardDescription>
                  Use your personal staff account. Accounts are never shared.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {challenge ? (
                  <form onSubmit={onVerify} className="space-y-4" noValidate>
                    <div className="space-y-1.5">
                      <label htmlFor="code" className="text-sm font-medium">
                        {useRecovery ? 'Recovery code' : 'Authenticator code'}
                      </label>
                      <Input
                        id="code"
                        name="code"
                        autoComplete="one-time-code"
                        inputMode={useRecovery ? 'text' : 'numeric'}
                        autoFocus
                        required
                        aria-invalid={!!error}
                      />
                      <p className="text-xs text-muted-foreground">
                        {useRecovery
                          ? 'Each recovery code works once.'
                          : 'Open your authenticator app and enter the 6-digit code.'}
                      </p>
                    </div>
                    {error && (
                      <p
                        role="alert"
                        className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
                      >
                        {error}
                      </p>
                    )}
                    <Button type="submit" className="w-full" disabled={pending}>
                      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                      {pending ? 'Verifying…' : 'Verify and sign in'}
                    </Button>
                    <div className="flex justify-between text-sm">
                      <button
                        type="button"
                        className="text-primary underline underline-offset-2"
                        onClick={() => {
                          setUseRecovery((v) => !v);
                          setError(null);
                        }}
                      >
                        {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground underline"
                        onClick={() => {
                          setChallenge(null);
                          setError(null);
                          setUseRecovery(false);
                        }}
                      >
                        Start over
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={onSubmit} className="space-y-4" noValidate>
                    <div className="space-y-1.5">
                      <label htmlFor="email" className="text-sm font-medium">
                        Email
                      </label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        required
                        aria-invalid={!!error}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="password" className="text-sm font-medium">
                        Password
                      </label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        aria-invalid={!!error}
                      />
                    </div>
                    {error && (
                      <p
                        role="alert"
                        className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
                      >
                        {error}
                      </p>
                    )}
                    <Button type="submit" className="w-full" disabled={pending}>
                      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                      {pending ? 'Signing in…' : 'Sign in'}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
            <p className="text-center text-sm text-muted-foreground">
              Interested in using Nexus for your practice?{' '}
              <a
                href={`mailto:${BRAND.enquiryEmail}`}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {BRAND.enquiryEmail}
              </a>
            </p>
          </div>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
