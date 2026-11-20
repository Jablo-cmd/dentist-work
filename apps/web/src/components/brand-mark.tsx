import { cn } from '@/lib/utils';

/** Original NOORDWYK DPS monogram: a rounded square with a stylised "N" stroke. Decorative (aria-hidden). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('h-9 w-9 shrink-0', className)} fill="none">
      <rect width="32" height="32" rx="8" fill="hsl(153 63% 37%)" />
      <path
        d="M10 23V9l12 14V9"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
