import { useEffect, useRef, useState } from 'react';
import type { AuthConfig } from '../backend/types.ts';
import { Button } from '../ui.tsx';

declare global {
  interface Window {
    google?: { accounts: { id: { initialize(o: unknown): void; renderButton(el: HTMLElement, o: unknown): void } } };
    AppleID?: { auth: { init(o: unknown): void; signIn(): Promise<{ authorization: { id_token: string }; user?: { name?: { firstName?: string; lastName?: string } } }> } };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Impossibile caricare lo script del provider'));
    document.head.appendChild(s);
  });
}

/**
 * Pulsanti "Continua con Google/Apple". Compaiono SOLO se il server ha le credenziali configurate
 * (client id letti da /api/health): senza configurazione non viene mostrato nulla di finto.
 */
export function SocialButtons({ config, onGoogle, onApple, onError }: { config: AuthConfig; onGoogle: (idToken: string) => void; onApple: (idToken: string, name?: string) => void; onError: (m: string) => void }) {
  const gRef = useRef<HTMLDivElement>(null);
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    if (!config.googleClientId || !gRef.current) return;
    let live = true;
    loadScript('https://accounts.google.com/gsi/client')
      .then(() => {
        if (!live || !window.google || !gRef.current) return;
        window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: (r: { credential: string }) => onGoogle(r.credential), ux_mode: 'popup' });
        window.google.accounts.id.renderButton(gRef.current, { theme: 'filled_black', size: 'large', text: 'continue_with', locale: 'it', shape: 'pill', width: Math.min(360, gRef.current.clientWidth || 320) });
      })
      .catch(() => live && onError('Google non è raggiungibile in questo momento.'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.googleClientId]);

  useEffect(() => {
    if (!config.appleClientId) return;
    let live = true;
    loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/it_IT/appleid.auth.js')
      .then(() => {
        if (!live || !window.AppleID) return;
        window.AppleID.auth.init({ clientId: config.appleClientId, scope: 'name email', redirectURI: config.appleRedirectUri, usePopup: true });
        setAppleReady(true);
      })
      .catch(() => live && onError('Apple non è raggiungibile in questo momento.'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.appleClientId]);

  if (!config.googleClientId && !config.appleClientId) return null;
  return (
    <div className="stack-sm" aria-label="Accesso con altri servizi">
      <div className="row" style={{ color: 'var(--text-3)' }}>
        <hr className="divider grow" />
        <span className="xs">oppure</span>
        <hr className="divider grow" />
      </div>
      {config.googleClientId && <div ref={gRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />}
      {config.appleClientId && (
        <Button
          variant="outline"
          block
          disabled={!appleReady}
          onClick={async () => {
            try {
              const r = await window.AppleID!.auth.signIn();
              const n = r.user?.name;
              onApple(r.authorization.id_token, [n?.firstName, n?.lastName].filter(Boolean).join(' ') || undefined);
            } catch (e) {
              if ((e as { error?: string })?.error !== 'popup_closed_by_user') onError('Accesso con Apple non riuscito.');
            }
          }}
        >
          Continua con Apple
        </Button>
      )}
    </div>
  );
}
