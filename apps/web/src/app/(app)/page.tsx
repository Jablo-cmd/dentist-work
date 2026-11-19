'use client';

import { practiceSchema, paginatedSchema } from '@dpms/contracts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { fetchLiveness, fetchReadiness } from '@/lib/health';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const ROLE_LABEL: Record<string, string> = {
  ORGANISATION_OWNER: 'Organisation Owner',
  PRACTICE_ADMINISTRATOR: 'Practice Administrator',
  DENTIST: 'Dentist / Practitioner',
  RECEPTIONIST: 'Receptionist',
  BILLING_ADMINISTRATOR: 'Billing Administrator',
};

/** Delivery status mirrors docs/08. Nothing here is patient or business data. */
const MODULES: { name: string; status: 'Available' | 'Planned' | 'Awaiting vendor' }[] = [
  { name: 'Sign-in, roles and practice access', status: 'Available' },
  { name: 'Practices and staff management', status: 'Available' },
  { name: 'Patient administration, medical history and duplicate review', status: 'Available' },
  { name: 'Appointments', status: 'Available' },
  { name: 'Clinical records, dental charting and treatment plans', status: 'Available' },
  { name: 'Imaging and document storage (needs object storage configured)', status: 'Available' },
  { name: 'VistaSoft / 3Shape TRIOS integration', status: 'Awaiting vendor' },
  { name: 'Billing and reporting', status: 'Planned' },
];

function SystemStatus() {
  const live = useApi((s) => fetchLiveness(s));
  const ready = useApi((s) => fetchReadiness(s));
  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardDescription>Live checks against the API and database.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Row label="API">
          {live.status === 'loading' ? (
            <Skeleton className="h-5 w-16" />
          ) : live.status === 'error' ? (
            <Badge tone="danger">Unreachable</Badge>
          ) : (
            <Badge tone="success">Online · v{live.data.version}</Badge>
          )}
        </Row>
        <Row label="Database">
          {ready.status === 'loading' ? (
            <Skeleton className="h-5 w-16" />
          ) : ready.status === 'error' ? (
            <Badge tone="warning">Unknown</Badge>
          ) : ready.data.checks.database.status === 'up' ? (
            <Badge tone="success">Connected</Badge>
          ) : (
            <Badge tone="danger">Unavailable</Badge>
          )}
        </Row>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function OverviewPage() {
  const { state } = useSession();
  const practices = useApi((signal) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal }),
  );
  if (state.status !== 'authenticated') return null;
  const { user } = state;
  const nameOf = (id: string | null) =>
    id === null
      ? 'All practices'
      : practices.status === 'success'
        ? (practices.data.data.find((p) => p.id === id)?.name ?? 'Unknown practice')
        : '…';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Foundation release. Clinical and patient modules are not yet available.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your access</CardTitle>
            <CardDescription>
              Granted by your administrator and enforced by the server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {practices.status === 'error' ? (
              <ErrorState error={practices.error} onRetry={practices.reload} />
            ) : (
              <ul className="space-y-2 text-sm">
                {user.assignments.map((a) => (
                  <li
                    key={`${a.role}-${a.practiceId}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="font-medium">{ROLE_LABEL[a.role] ?? a.role}</span>
                    <Badge>{nameOf(a.practiceId)}</Badge>
                  </li>
                ))}
                {user.assignments.length === 0 && (
                  <li className="text-muted-foreground">
                    No roles assigned. Contact your administrator.
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
        <SystemStatus />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Delivery roadmap</CardTitle>
          <CardDescription>
            What is built today versus planned. Integrations stay disabled until vendors confirm
            access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {MODULES.map((m) => (
              <li key={m.name} className="flex items-center justify-between py-2">
                <span>{m.name}</span>
                <Badge
                  tone={
                    m.status === 'Available'
                      ? 'success'
                      : m.status === 'Awaiting vendor'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {m.status}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
