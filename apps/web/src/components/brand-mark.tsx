import { cn } from '@/lib/utils';

/** Original monogram: a rounded square with a stylised "M" stroke. Decorative (aria-hidden). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('h-9 w-9 shrink-0', className)} fill="none">
      <rect width="32" height="32" rx="8" fill="hsl(153 63% 37%)" />
      <path
        d="M8.5 23V10l7.5 9 7.5-9v13"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
