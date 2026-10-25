import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Me } from '@shared/types.ts';
import { auth, call, setUnauthorizedHandler } from './api';

interface Session {
  /** undefined = sto controllando la sessione; null = non connesso. */
  me: Me | null | undefined;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Rilegge il profilo dal server (dopo averlo modificato). */
  refresh(): Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));
    call<Me | null>('me').then(setMe, () => setMe(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (e: string, p: string) => setMe(await auth.login(e, p)), []);
  const register = useCallback(async (e: string, p: string) => setMe(await auth.register(e, p)), []);
  const logout = useCallback(async () => {
    await auth.logout().catch(() => {});
    setMe(null);
  }, []);
  const refresh = useCallback(async () => {
    setMe(await call<Me | null>('me').catch(() => null));
  }, []);

  const value = useMemo(() => ({ me, login, register, logout, refresh }), [me, login, register, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fuori da SessionProvider');
  return v;
}
