import { Compass, Home, Newspaper, Shield, UserRound, Users } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../session.tsx';

const ITEMS = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/esplora', label: 'Esplora', Icon: Compass },
  { to: '/club', label: 'Club', Icon: Users },
  { to: '/social', label: 'Social', Icon: Newspaper },
  { to: '/profilo', label: 'Profilo', Icon: UserRound },
];

/** Pagine a schermo intero (form, accesso): senza barra inferiore. */
const NO_NAV = [/^\/benvenuto/, /^\/recupera-password/, /^\/reimposta-password/, /^\/verifica-email/, /^\/profilo\/inizia/, /^\/uscita\/nuova/, /^\/uscita\/[^/]+\/modifica/, /^\/club\/nuovo/, /^\/sfide\/nuova/, /^\/percorso\/nuovo/, /^\/privacy/, /^\/piano\/procedura/, /^\/piano\/sessione\/nuova/, /^\/piano\/sessione\/[^/]+\/modifica/, /^\/percorso\/[^/]+\/modifica/];

export function Shell() {
  const { pathname } = useLocation();
  const { mode, refreshUnread } = useSession();
  const hideNav = NO_NAV.some((r) => r.test(pathname));

  useEffect(() => {
    window.scrollTo(0, 0);
    refreshUnread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Vai al contenuto
      </a>
      <main id="main" tabIndex={-1} style={{ outline: 'none', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {mode === 'demo' && !pathname.startsWith('/benvenuto') && (
          <div className="banner" role="note" style={{ margin: 'calc(var(--safe-top) + 8px) var(--gutter) 0', maxWidth: 'var(--col)', alignSelf: 'center', width: 'calc(100% - 2 * var(--gutter))' }}>
            <Shield size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
            <span>
              <strong>Modalità demo.</strong> I dati restano solo su questo dispositivo e non vengono condivisi. Gli elementi “DEMO” sono esempi.
            </span>
          </div>
        )}
        <Outlet />
      </main>
      {!hideNav && (
        <nav className="nav" aria-label="Navigazione principale">
          <ul>
            {ITEMS.map(({ to, label, Icon, end }) => (
              <li key={to} style={{ display: 'contents' }}>
                <NavLink to={to} end={end}>
                  <Icon size={22} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
