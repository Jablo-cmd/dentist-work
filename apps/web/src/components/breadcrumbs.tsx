'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LABELS: Record<string, string> = {
  practices: 'Practices',
  patients: 'Patients',
  new: 'Register patient',
  duplicates: 'Duplicate review',
  appointments: 'Appointments',
  reports: 'Reports',
  users: 'Staff',
  audit: 'Audit trail',
  'change-password': 'Password',
  security: 'Two-factor',
  clinical: 'Clinical record',
  billing: 'Billing',
  invoice: 'Invoice',
  statement: 'Account statement',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Breadcrumbs derived from the route. Identifiers are never shown (patient ids are not labels). */
export function Breadcrumbs() {
  const pathname = usePathname();
  const segs = pathname.split('/').filter(Boolean);
  const crumbs: { href: string; label: string }[] = [{ href: '/', label: 'Overview' }];
  let href = '';
  segs.forEach((s, i) => {
    href += `/${s}`;
    const prev = segs[i - 1];
    const label = UUID.test(s)
      ? prev === 'invoice'
        ? 'Invoice'
        : 'Patient record'
      : (LABELS[s] ?? s);
    // "invoice" segment is a path-only grouping; its id segment carries the label
    if (s === 'invoice') return;
    crumbs.push({ href, label });
  });
  if (crumbs.length === 1) return <span className="text-sm font-medium">Overview</span>;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={c.href}
              className={last ? 'flex min-w-0 items-center' : 'hidden items-center sm:flex'}
            >
              {last ? (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {c.label}
                </span>
              ) : (
                <>
                  <Link href={c.href} className="rounded-sm hover:text-foreground">
                    {c.label}
                  </Link>
                  <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0" aria-hidden />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
