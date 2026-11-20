import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Status semantics (never reuse one tone for another meaning):
 *  success = completed/confirmed/paid · warning = pending/needs attention · danger = critical/failed/overdue
 *  info = informational · brand = selected/active context · neutral = no status
 * Semantic tones carry a leading dot so status never depends on colour alone.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground ring-border',
        brand: 'bg-accent text-accent-foreground ring-brand/20',
        success: 'bg-success-soft text-success ring-success/20',
        warning: 'bg-warning-soft text-warning ring-warning/25',
        danger: 'bg-danger-soft text-danger ring-danger/20',
        info: 'bg-info-soft text-info ring-info/20',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const DOT_TONES = new Set(['success', 'warning', 'danger', 'info']);

export function Badge({
  className,
  tone,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {tone && DOT_TONES.has(tone) && (
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
