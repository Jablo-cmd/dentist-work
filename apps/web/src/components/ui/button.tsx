import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Heights: sm 32 · default 40 · lg 44 (touch). All buttons share radius, weight and focus ring. */
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-b from-primary to-primary-hover text-primary-foreground shadow-card shadow-inset hover:from-primary-hover hover:to-primary-hover active:translate-y-px',
        secondary: 'bg-accent text-accent-foreground hover:bg-accent/70',
        outline:
          'border border-input bg-card text-foreground shadow-card hover:border-foreground/30 hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger text-white hover:bg-danger/90',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3.5',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
