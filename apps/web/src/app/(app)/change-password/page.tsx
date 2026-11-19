'use client';

import { changePasswordRequestSchema, MIN_PASSWORD_LENGTH } from '@dpms/contracts';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { describeError } from '@/lib/errors';
import { useSession } from '@/lib/session';

export default function ChangePasswordPage() {
  const { state, refresh } = useSession();
  const { notify } = useToast();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const forced = state.status === 'authenticated' && state.user.mustChangePassword;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    if (f.get('newPassword') !== f.get('confirm'))
      return setError('The new passwords do not match.');
    const parsed = changePasswordRequestSchema.safeParse({
      currentPassword: f.get('currentPassword'),
      newPassword: f.get('newPassword'),
    });
    if (!parsed.success)
      return setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    setPending(true);
    try {
      await apiFetch('/auth/change-password', null, { method: 'POST', body: parsed.data });
      await refresh();
      notify('success', 'Password changed.');
      router.replace('/');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Change password</h1>
      {forced && (
        <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          You must choose a new password before continuing.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>New password</CardTitle>
          <CardDescription>
            At least {MIN_PASSWORD_LENGTH} characters. Other devices will be signed out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field id="currentPassword" label="Current password">
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field id="newPassword" label="New password">
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            </Field>
            <Field id="confirm" label="Confirm new password">
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
            </Field>
            {error && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Change password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
