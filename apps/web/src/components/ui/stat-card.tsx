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
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
            tone === 'brand' && 'bg-accent text-accent-foreground ring-brand/20',
            tone === 'info' && 'bg-info-soft text-info ring-info/20',
            tone === 'warning' && 'bg-warning-soft text-warning ring-warning/25',
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
