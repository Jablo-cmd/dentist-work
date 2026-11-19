'use client';

import {
  createUserRequestSchema,
  paginatedSchema,
  practiceSchema,
  ROLE_KEYS,
  userSummarySchema,
  type RoleKey,
  type UserSummary,
} from '@dpms/contracts';
import { useState, type FormEvent } from 'react';
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
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const ROLE_LABEL: Record<RoleKey, string> = {
  ORGANISATION_OWNER: 'Organisation Owner',
  PRACTICE_ADMINISTRATOR: 'Practice Administrator',
  DENTIST: 'Dentist / Practitioner',
  RECEPTIONIST: 'Receptionist',
  BILLING_ADMINISTRATOR: 'Billing Administrator',
};
const usersSchema = paginatedSchema(userSummarySchema);
const practicesSchema = paginatedSchema(practiceSchema);

export default function UsersPage() {
  const { state } = useSession();
  const { notify } = useToast();
  const users = useApi((signal) => apiFetch('/users?pageSize=100', usersSchema, { signal }));
  const practices = useApi((signal) =>
    apiFetch('/practices?pageSize=100', practicesSchema, { signal }),
  );
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  if (state.status !== 'authenticated') return null;
  const manage = can(state.user, 'user.manage');
  const practiceName = (id: string | null) =>
    id === null
      ? 'All practices'
      : ((practices.status === 'success'
          ? practices.data.data.find((p) => p.id === id)?.name
          : undefined) ?? 'Unknown');
  const orgWide = state.user.assignments.some(
    (a) => a.practiceId === null && a.role === 'ORGANISATION_OWNER',
  );
  const roleChoices = orgWide
    ? ROLE_KEYS
    : ROLE_KEYS.filter((r) => ['DENTIST', 'RECEPTIONIST', 'BILLING_ADMINISTRATOR'].includes(r));

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const f = new FormData(e.currentTarget);
    const role = String(f.get('role')) as RoleKey;
    const practiceId = role === 'ORGANISATION_OWNER' ? null : String(f.get('practiceId'));
    const parsed = createUserRequestSchema.safeParse({
      email: f.get('email'),
      displayName: f.get('displayName'),
      temporaryPassword: f.get('temporaryPassword'),
      assignments: [{ role, practiceId }],
    });
    if (!parsed.success)
      return setFormError(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    try {
      await apiFetch('/users', userSummarySchema, { method: 'POST', body: parsed.data });
      notify('success', 'User created. They must change the temporary password at first sign-in.');
      setShowForm(false);
      users.reload();
    } catch (err) {
      setFormError(describeError(err));
    }
  }

  async function toggleActive(u: UserSummary) {
    try {
      await apiFetch(`/users/${u.id}`, userSummarySchema, {
        method: 'PATCH',
        body: { isActive: !u.isActive },
      });
      notify('success', u.isActive ? 'User deactivated and signed out.' : 'User reactivated.');
      users.reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }

  async function resetPassword(e: FormEvent<HTMLFormElement>, u: UserSummary) {
    e.preventDefault();
    const pw = String(new FormData(e.currentTarget).get('pw'));
    try {
      await apiFetch(`/users/${u.id}/reset-password`, null, {
        method: 'POST',
        body: { temporaryPassword: pw },
      });
      notify('success', 'Temporary password set. The user must change it at next sign-in.');
      setResetFor(null);
      users.reload();
    } catch (err) {
      notify('error', describeError(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="text-sm text-muted-foreground">
            Named accounts only — never share a login.
          </p>
        </div>
        {manage && (
          <Button onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'Add staff member'}
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New staff member</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createUser} className="grid gap-4 sm:grid-cols-2">
              <Field id="displayName" label="Full name">
                <Input id="displayName" name="displayName" required />
              </Field>
              <Field id="email" label="Email">
                <Input id="email" name="email" type="email" autoComplete="off" required />
              </Field>
              <Field id="role" label="Role">
                <Select id="role" name="role" defaultValue="RECEPTIONIST">
                  {roleChoices.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="practiceId" label="Practice">
                <Select id="practiceId" name="practiceId" required>
                  {practices.status === 'success' &&
                    practices.data.data.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field
                id="temporaryPassword"
                label="Temporary password"
                hint="At least 12 characters. Share it securely; the user must change it at first sign-in."
              >
                <Input
                  id="temporaryPassword"
                  name="temporaryPassword"
                  type="text"
                  autoComplete="off"
                  required
                />
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
                <Button type="submit">Create account</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        {users.status === 'loading' && (
          <div className="space-y-3 p-5" aria-busy="true">
            <span className="sr-only">Loading staff</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        )}
        {users.status === 'error' && <ErrorState error={users.error} onRetry={users.reload} />}
        {users.status === 'success' && users.data.data.length === 0 && (
          <EmptyState title="No staff yet" description="No staff accounts are visible to you." />
        )}
        {users.status === 'success' && users.data.data.length > 0 && (
          <ul className="divide-y">
            {users.data.data.map((u) => (
              <li key={u.id} className="space-y-2 px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {u.displayName} {!u.isActive && <Badge className="ml-1">Inactive</Badge>}
                      {u.mfaEnabled && (
                        <Badge tone="success" className="ml-1">
                          2FA
                        </Badge>
                      )}
                      {u.mustChangePassword && (
                        <Badge tone="warning" className="ml-1">
                          Password change pending
                        </Badge>
                      )}
                    </p>
                    <p className="text-muted-foreground">{u.email}</p>
                  </div>
                  {manage && u.id !== state.user.id && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setResetFor(resetFor === u.id ? null : u.id)}
                      >
                        Reset password
                      </Button>
                      {u.mfaEnabled && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Reset two-factor authentication for ${u.displayName}? They will be signed out and must set it up again.`,
                              )
                            )
                              void apiFetch(`/users/${u.id}/mfa-reset`, null, {
                                method: 'POST',
                                body: {},
                              }).then(
                                () => {
                                  notify('success', 'Two-factor authentication reset.');
                                  users.reload();
                                },
                                (e) => notify('error', describeError(e)),
                              );
                          }}
                        >
                          Reset 2FA
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => void toggleActive(u)}>
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {u.assignments.map((a) => (
                    <Badge key={a.id}>
                      {ROLE_LABEL[a.role]} · {practiceName(a.practiceId)}
                    </Badge>
                  ))}
                  {u.assignments.length === 0 && <Badge tone="warning">No roles</Badge>}
                </div>
                {resetFor === u.id && (
                  <form
                    onSubmit={(e) => void resetPassword(e, u)}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <Field id={`pw-${u.id}`} label="New temporary password">
                      <Input id={`pw-${u.id}`} name="pw" required autoComplete="off" />
                    </Field>
                    <Button type="submit" size="sm">
                      Set
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
