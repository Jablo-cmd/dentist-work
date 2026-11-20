'use client';

import {
  createContext,
  useContext,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Accessible tabs (WAI-ARIA tabs pattern: roving tabindex, arrow/Home/End keys). Controlled, so the
 * caller decides where the active tab lives (state, URL). Panels stay mounted (hidden) so form state
 * inside a panel is never lost when switching tabs.
 */
interface Ctx {
  variant: 'underline' | 'pills';
  value: string;
  onChange: (v: string) => void;
  base: string;
}
const TabsContext = createContext<Ctx | null>(null);
const useTabs = () => {
  const c = useContext(TabsContext);
  if (!c) throw new Error('Tabs components must be used inside <Tabs>');
  return c;
};

export function Tabs({
  value,
  onValueChange,
  children,
  className,
  variant = 'pills',
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
  className?: string;
  /** underline = primary section tabs; pills = secondary (segmented) tabs inside a section. */
  variant?: 'underline' | 'pills';
}) {
  const base = useId();
  return (
    <TabsContext.Provider value={{ variant, value, onChange: onValueChange, base }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, label }: { children: ReactNode; label: string }) {
  const { variant } = useTabs();
  const ref = useRef<HTMLDivElement>(null);
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const tabs = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role=tab]') ?? []);
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const next =
      e.key === 'ArrowRight'
        ? tabs[(i + 1) % tabs.length]
        : e.key === 'ArrowLeft'
          ? tabs[(i - 1 + tabs.length) % tabs.length]
          : e.key === 'Home'
            ? tabs[0]
            : e.key === 'End'
              ? tabs[tabs.length - 1]
              : null;
    if (next) {
      e.preventDefault();
      next.focus();
      next.click();
    }
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div
        ref={ref}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          'flex min-w-max gap-1',
          variant === 'underline' ? 'border-b' : 'w-fit rounded-lg bg-muted p-1',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  const { variant, value: active, onChange, base } = useTabs();
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${base}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${base}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => onChange(value)}
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium transition-colors',
        variant === 'underline' ? '-mb-px h-11 border-b-2 px-3' : 'h-9 rounded-md px-3.5',
        variant === 'underline' &&
          (selected
            ? 'border-brand text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground'),
        variant === 'pills' &&
          (selected
            ? 'bg-card text-foreground shadow-card'
            : 'text-muted-foreground hover:text-foreground'),
      )}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const { value: active, base } = useTabs();
  return (
    <div
      role="tabpanel"
      id={`${base}-panel-${value}`}
      aria-labelledby={`${base}-tab-${value}`}
      hidden={active !== value}
      className="space-y-4 pt-4"
    >
      {children}
    </div>
  );
}
