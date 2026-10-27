import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Me } from '../shared/types.ts';
import { detectBackend } from './backend/index.ts';
import { setUnauthorizedHandler } from './backend/http.ts';
import type { Backend } from './backend/types.ts';
import { Spinner, useToast } from './ui.tsx';

interface SessionValue {
  backend: Backend;
  mode: 'server' | 'demo';
  me: Me | null;
  setMe: (m: Me | null) => void;
  unread: number;
  refreshUnread: () => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider mancante');
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(0);
  const toast = useToast();

  // Sessione scaduta o account eliminato: torna alla schermata di accesso (RequireAuth) senza stato sporco.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe((m) => {
        if (m) toast('err', 'Sessione scaduta. Accedi di nuovo.');
        return null;
      });
      setUnread(0);
    });
    return () => setUnauthorizedHandler(null);
  }, [toast]);

  useEffect(() => {
    let live = true;
    (async () => {
      const b = await detectBackend();
      let m: Me | null = null;
      try {
        m = await b.me();
      } catch {
        m = null;
      }
      if (!live) return;
      setBackend(b);
      setMe(m);
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  const refreshUnread = useCallback(() => {
    if (!backend || !me) return setUnread(0);
    backend.listNotifications().then(
      (n) => setUnread(n.filter((x) => !x.readAt).length),
      () => {},
    );
  }, [backend, me]);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  const value = useMemo<SessionValue | null>(
    () =>
      backend
        ? {
            backend,
            mode: backend.auth.mode,
            me,
            setMe,
            unread,
            refreshUnread,
            logout: async () => {
              await backend.auth.logout();
              setMe(null);
              setUnread(0);
            },
          }
        : null,
    [backend, me, unread, refreshUnread],
  );

  if (!ready || !value) return <Spinner label="Avvio dell'app" />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Porta alla schermata di accesso e poi torna alla pagina richiesta. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const loc = useLocation();
  if (!me) return <Navigate to={`/benvenuto?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export function loginPath(next: string): string {
  return `/benvenuto?next=${encodeURIComponent(next)}`;
}

export function errText(e: unknown): string {
  return (e as { message?: string })?.message ?? 'Qualcosa è andato storto. Riprova.';
}
