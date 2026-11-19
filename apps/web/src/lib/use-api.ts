'use client';

import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> =
  { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'success'; data: T };

/** Minimal data-loading hook with explicit loading / error / success states and manual retry. */
export function useApi<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    loader(ctrl.signal).then(
      (data) => !ctrl.signal.aborted && setState({ status: 'success', data }),
      (error: unknown) => !ctrl.signal.aborted && setState({ status: 'error', error }),
    );
    return () => ctrl.abort();
  }, [tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
