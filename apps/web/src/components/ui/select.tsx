import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-[inset_0_1px_2px_hsl(154_30%_20%/0.05)] transition-colors hover:border-foreground/40 focus-visible:border-brand focus-visible:ring-brand/30 focus-visible:ring-offset-0 disabled:bg-muted disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
