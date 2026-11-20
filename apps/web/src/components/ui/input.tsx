import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-[inset_0_1px_2px_hsl(154_30%_20%/0.05)] transition-colors placeholder:text-muted-foreground/70 hover:border-foreground/40 focus-visible:border-brand focus-visible:ring-brand/30 focus-visible:ring-offset-0 disabled:bg-muted disabled:opacity-60 aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
