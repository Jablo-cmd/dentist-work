'use client';

import {
  currentUserSchema,
  loginResponseSchema,
  type CurrentUser,
  type LoginRequest,
} from '@dpms/contracts';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { ApiRequestError, apiFetch } from './api';

type SessionState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: CurrentUser };
interface SessionApi {
  state: SessionState;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<SessionApi | null>(null);
const meSchema = z.object({ user: currentUserSchema });

/**
 * Holds the signed-in user for UI purposes only. Authorisation is enforced by the API on every
 * request; permissions here merely decide what to render.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const router = useRouter();

  useEffect(() => {
    const ctrl = new AbortController();
    apiFetch('/auth/me', meSchema, { signal: ctrl.signal }).then(
      ({ user }) => setState({ status: 'authenticated', user }),
      (e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) setState({ status: 'anonymous' });
        else setState({ status: 'anonymous' });
      },
    );
    return () => ctrl.abort();
  }, []);

  const login = useCallback(async (input: LoginRequest) => {
    const { user } = await apiFetch('/auth/login', loginResponseSchema, {
      method: 'POST',
      body: input,
    });
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', null, { method: 'POST' });
    } finally {
      setState({ status: 'anonymous' });
      router.replace('/login');
    }
  }, [router]);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used within SessionProvider');
  return v;
}
