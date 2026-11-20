import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-input bg-card px-3 text-sm hover:border-foreground/40 disabled:bg-muted disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = 'Select';
