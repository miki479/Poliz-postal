import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Me } from '@shared/types.ts';
import { auth, call, setUnauthorizedHandler } from './api';

interface Session {
  /** undefined = sto controllando la sessione; null = non connesso. */
  me: Me | null | undefined;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  loginGoogle(idToken: string): Promise<void>;
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
  const loginGoogle = useCallback(async (idToken: string) => setMe(await auth.google(idToken)), []);
  const logout = useCallback(async () => {
    await auth.logout().catch(() => {});
    setMe(null);
  }, []);
  const refresh = useCallback(async () => {
    // A network interruption must not destroy the authenticated navigator/recording.
    // Actual 401 responses are handled by setUnauthorizedHandler.
    setMe(await call<Me | null>('me'));
  }, []);

  const value = useMemo(() => ({ me, login, register, loginGoogle, logout, refresh }), [me, login, register, loginGoogle, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fuori da SessionProvider');
  return v;
}
