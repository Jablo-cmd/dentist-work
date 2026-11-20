'use client';

import type { Patient } from '@dpms/contracts';
import { AlertTriangle, Phone } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PatientProvider, usePatient } from '@/lib/patient-context';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { paginatedSchema, practiceSchema } from '@dpms/contracts';
import { useApi } from '@/lib/use-api';

function ageOf(dob: string): number {
  const d = new Date(`${dob}T12:00:00Z`);
  const n = new Date();
  let age = n.getUTCFullYear() - d.getUTCFullYear();
  if (
    n.getUTCMonth() < d.getUTCMonth() ||
    (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())
  )
    age--;
  return age;
}

/**
 * Persistent patient header (identity, contact, practice, critical alert) and section tabs shared by
 * the overview, clinical record and billing views. Printable views (invoice, statement) bypass it.
 */
export default function PatientLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  if (/\/(invoice|statement)(\/|$)/.test(pathname)) return <>{children}</>;
  return (
    <PatientProvider id={id}>
      <PatientHeader />
      <div className="mt-4">{children}</div>
    </PatientProvider>
  );
}

function PatientHeader() {
  const { patient } = usePatient();
  const { state } = useSession();
  const pathname = usePathname();
  const practices = useApi((s) =>
    apiFetch('/practices?pageSize=100', paginatedSchema(practiceSchema), { signal: s }),
  );
  if (state.status !== 'authenticated') return null;
  const user = state.user;
  const base = `/patients/${patient.id}`;
  const tabs = [
    { href: base, label: 'Overview', show: true },
    { href: `${base}/clinical`, label: 'Clinical record', show: can(user, 'clinical_record.read') },
    { href: `${base}/billing`, label: 'Billing', show: can(user, 'billing.read') },
  ].filter((t) => t.show);
  const practiceName = (pid: string) =>
    practices.status === 'success'
      ? (practices.data.data.find((p) => p.id === pid)?.name ?? 'Practice')
      : '…';
  const severe = patient.severeAllergyCount ?? 0;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-accent-foreground"
          >
            {(patient.firstName[0] ?? '') + (patient.lastName[0] ?? '')}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">
              {patient.firstName} {patient.lastName}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>
                Born {patient.dateOfBirth} · {ageOf(patient.dateOfBirth)} yrs
              </span>
              {patient.mobilePhone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" aria-hidden /> {patient.mobilePhone}
                </span>
              )}
              {!patient.isActive && <Badge tone="neutral">Inactive</Badge>}
            </p>
          </div>
          <div className="flex basis-full flex-wrap gap-1 sm:basis-auto">
            {patient.practiceIds.map((pid) => (
              <Badge key={pid} tone="brand">
                {practiceName(pid)}
              </Badge>
            ))}
          </div>
        </div>
        {severe > 0 && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {severe} severe allerg
            {severe > 1 ? 'ies' : 'y'} recorded — see medical history.
          </div>
        )}
      </Card>
      <nav aria-label="Patient sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b">
          {tabs.map((t) => {
            const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors',
                    active
                      ? 'border-brand text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export type { Patient };
