import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Data table: horizontally scrollable on small screens, sticky-free, right-align numeric columns with `numeric`. */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}
export const THead = (p: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead
    className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground"
    {...p}
  />
);
export const TBody = (p: HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className="divide-y divide-border/70" {...p} />
);
export const TR = ({ className, ...p }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('hover:bg-muted/40', className)} {...p} />
);
export function TH({
  className,
  numeric,
  ...p
}: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn('px-5 py-3 font-medium', numeric && 'text-right', className)}
      {...p}
    />
  );
}
export function TD({
  className,
  numeric,
  ...p
}: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn('px-5 py-3.5 align-middle', numeric && 'text-right tabular-nums', className)}
      {...p}
    />
  );
}
