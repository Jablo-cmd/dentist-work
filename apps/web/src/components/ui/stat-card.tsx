import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from './card';

/** KPI tile. `value` is always real data supplied by the caller; pass a Skeleton while loading. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: 'brand' | 'info' | 'warning';
}) {
  return (
    <Card className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
      <span
        className={cn(
          'hidden h-10 w-10 shrink-0 items-center justify-center rounded-md sm:flex',
          tone === 'brand' && 'bg-accent text-accent-foreground',
          tone === 'info' && 'bg-info-soft text-info',
          tone === 'warning' && 'bg-warning-soft text-warning',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}
