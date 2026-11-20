import { BRAND } from '@/lib/brand';

/** Discreet application footer carrying the official punchline. Hidden when printing. */
export function AppFooter() {
  return (
    <footer className="print:hidden border-t bg-card/60 px-4 py-3 text-center text-xs text-muted-foreground sm:px-6">
      <p>
        <span className="font-medium text-foreground/70">{BRAND.name}</span>
        <span aria-hidden> · </span>
        <span>{BRAND.punchline}</span>
      </p>
    </footer>
  );
}
