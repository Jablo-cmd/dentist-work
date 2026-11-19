'use client';

import {
  Building2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Permission } from '@dpms/contracts';
import { cn } from '@/lib/utils';

const NAV: { href: string; label: string; icon: LucideIcon; permission?: Permission }[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/practices', label: 'Practices', icon: Building2, permission: 'practice.read' },
  { href: '/users', label: 'Staff', icon: Users, permission: 'user.read' },
  { href: '/change-password', label: 'Password', icon: KeyRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { state, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.status === 'anonymous') router.replace('/login');
    if (
      state.status === 'authenticated' &&
      state.user.mustChangePassword &&
      pathname !== '/change-password'
    )
      router.replace('/change-password');
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

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV.filter((n) => !n.permission || can(user, n.permission)).map(
        ({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-white/10 hover:text-white',
                active && 'bg-white/10 text-white',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </Link>
          );
        },
      )}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside
        className={cn('bg-sidebar p-4 text-sidebar-foreground lg:block', open ? 'block' : 'hidden')}
      >
        <div className="mb-6 hidden px-3 lg:block">
          <p className="font-semibold text-white">Noordwyk Dental</p>
          <p className="text-xs text-sidebar-foreground/60">Practice management</p>
        </div>
        {nav}
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b bg-card px-4">
          <div className="flex items-center gap-2">
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
            <span className="font-semibold lg:hidden">Noordwyk Dental</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.displayName}
            </span>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </Button>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
