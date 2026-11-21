'use client';

import {
  Building2,
  BarChart3,
  CalendarDays,
  CopyCheck,
  KeyRound,
  ScrollText,
  ShieldCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AppFooter } from '@/components/app-footer';
import { BrandMark } from '@/components/brand-mark';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Skeleton } from '@/components/ui/skeleton';
import { BRAND, ROLE_LABEL } from '@/lib/brand';
import { can } from '@/lib/permissions';
import { requiredRedirect } from '@/lib/required-redirect';
import { useSession } from '@/lib/session';
import type { Permission } from '@dpms/contracts';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission | Permission[];
}
/** Navigation groups. Items are filtered by the user's permissions; empty groups disappear. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Practice',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      { href: '/patients', label: 'Patients', icon: UserRound, permission: 'patient.read' },
      {
        href: '/appointments',
        label: 'Appointments',
        icon: CalendarDays,
        permission: 'appointment.read',
      },
      {
        href: '/patients/duplicates',
        label: 'Duplicate review',
        icon: CopyCheck,
        permission: 'patient.update',
      },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/practices', label: 'Practices', icon: Building2, permission: 'practice.read' },
      { href: '/users', label: 'Staff', icon: Users, permission: 'user.read' },
      {
        href: '/reports',
        label: 'Reports',
        icon: BarChart3,
        permission: ['appointment.read', 'financial_report.read'],
      },
      { href: '/audit', label: 'Audit trail', icon: ScrollText, permission: 'audit.read' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/change-password', label: 'Password', icon: KeyRound },
      { href: '/security', label: 'Two-factor', icon: ShieldCheck },
    ],
  },
];

const COLLAPSE_KEY = 'dpms.sidebar.collapsed';

export function AppShell({ children }: { children: ReactNode }) {
  const { state, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* storage unavailable: default expanded */
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  useEffect(() => {
    if (state.status === 'anonymous') router.replace('/login');
    if (state.status === 'authenticated') {
      const to = requiredRedirect(state.user, pathname);
      if (to) router.replace(to);
    }
  }, [state, router, pathname]);
  useEffect(() => setOpen(false), [pathname]);

  if (state.status !== 'authenticated') {
    return (
      <div className="p-8" aria-busy="true">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-40 w-full max-w-3xl" />
      </div>
    );
  }
  const { user } = state;
  const primaryRole = user.assignments[0] ? (ROLE_LABEL[user.assignments[0].role] ?? '') : '';
  const initials =
    user.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';

  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : href === '/patients'
        ? pathname === '/patients' ||
          (pathname.startsWith('/patients/') && !pathname.startsWith('/patients/duplicates'))
        : pathname.startsWith(href);

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter(
          (n) => !n.permission || [n.permission].flat().some((perm) => can(user, perm)),
        );
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <p
              className={cn(
                'mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted',
                collapsed && 'lg:sr-only',
              )}
            >
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={collapsed ? label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-offset-sidebar',
                        collapsed && 'lg:justify-center lg:px-0',
                        active && 'bg-sidebar-active text-white shadow-inset',
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute inset-y-2 left-0 w-1 rounded-r bg-brand"
                        />
                      )}
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      <span className={cn(collapsed && 'lg:sr-only')}>{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen print:block lg:flex">
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-forest/50 lg:hidden print:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          'print:hidden fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto bg-gradient-to-b from-sidebar to-[hsl(156_58%_14%)] text-sidebar-foreground shadow-pop transition-transform lg:shadow-none lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 lg:shrink-0 lg:transition-[width]',
          // Closed drawer is removed from the tab order and accessibility tree (not just moved off-screen).
          open ? 'translate-x-0' : '-translate-x-full max-lg:invisible',
          collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-3 px-4 pb-6 pt-6',
            collapsed && 'lg:justify-center lg:px-2',
          )}
        >
          <BrandMark />
          <div className={cn('min-w-0 leading-tight', collapsed && 'lg:sr-only')}>
            <p className="text-lg font-semibold leading-tight tracking-tight text-white">
              {BRAND.name}
            </p>
            <p className="text-[11px] leading-snug text-sidebar-muted">{BRAND.description}</p>
          </div>
        </div>
        <div className="flex-1 px-3 pb-4">{nav}</div>
        <div className="hidden border-t border-white/10 p-3 lg:block">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground hover:bg-white/10 hover:text-white focus-visible:ring-offset-sidebar',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden /> Collapse
              </>
            )}
          </button>
        </div>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="print:hidden sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border/70 bg-card/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={open ? 'Close navigation' : 'Open navigation'}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2.5 sm:flex">
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
              >
                {initials}
              </span>
              <div className="text-right leading-tight">
                <p className="text-sm font-medium">{user.displayName}</p>
                {primaryRole && <p className="text-xs text-muted-foreground">{primaryRole}</p>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </Button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
