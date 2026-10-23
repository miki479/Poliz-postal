import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { BRAND } from './brand.ts';
import { isDemoId } from '../shared/demo.ts';
import type { UserPublic } from '../shared/types.ts';

/* ---------- Logo ---------- */

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="46" height="46" rx="14" fill="#0f2a2d" stroke="#36e0e5" strokeOpacity="0.5" />
      <path d="M10 33c6 0 7-6 12-6s6 5 11 5 5-8 5-14" stroke="#36e0e5" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="38" cy="13" r="3.6" fill="#7cf5ed" />
    </svg>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="logo" aria-label={BRAND.name}>
      <LogoMark size={size} />
      <span className="logo-text" aria-hidden="true">
        {BRAND.first}
        <span>{BRAND.second}</span>
      </span>
    </span>
  );
}

/* ---------- Pulsanti ---------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'default';
  size?: 'md' | 'sm';
  block?: boolean;
  loading?: boolean;
};

export function Button({ variant = 'default', size = 'md', block, loading, className = '', children, disabled, ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size === 'sm' && 'btn-sm', block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button type="button" {...rest} className={cls} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <Loader2 size={18} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ---------- Avatar ---------- */

export function Avatar({ user, size = 40 }: { user: Pick<UserPublic, 'displayName' | 'hue'> & { avatar?: string | null }; size?: number }) {
  if (user.avatar)
    return <img className="avatar" src={user.avatar} alt={user.displayName} width={size} height={size} style={{ ['--size' as string]: `${size}px`, objectFit: 'cover' }} />;
  const initials = user.displayName
    .replace(/\(demo\)/i, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      className="avatar"
      style={{ ['--size' as string]: `${size}px`, background: `hsl(${user.hue} 45% 32%)` }}
      role="img"
      aria-label={user.displayName}
    >
      {initials || '?'}
    </span>
  );
}

export function AvatarStack({ users, total, max = 4 }: { users: UserPublic[] | null; total: number; max?: number }) {
  const shown = users?.slice(0, max) ?? [];
  const rest = total - shown.length;
  if (!shown.length) return null;
  return (
    <span className="avatar-stack">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={28} />
      ))}
      {rest > 0 && (
        <span className="avatar avatar-more" style={{ ['--size' as string]: '28px' }}>
          +{rest}
        </span>
      )}
    </span>
  );
}

export function DemoChip({ id }: { id: string }) {
  return isDemoId(id) ? <span className="chip demo">DEMO</span> : null;
}

/* ---------- Form ---------- */

export function Field({
  label,
  optional,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label} {optional && <span className="opt">(facoltativo)</span>}
      </label>
      {children}
      {hint && !error && (
        <span className="hint" id={`${htmlFor}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error-text" id={`${htmlFor}-err`} role="alert">
          <AlertCircle size={16} aria-hidden="true" style={{ marginTop: 2, flex: 'none' }} />
          {error}
        </span>
      )}
    </div>
  );
}

export function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-err` : hint ? `${id}-hint` : undefined;
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="grow">
        <div className="label" id={id}>
          {label}
        </div>
        {description && <div className="hint">{description}</div>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className="switch" onClick={() => onChange(!checked)} />
    </div>
  );
}

/* ---------- Stati ---------- */

export function Spinner({ label = 'Caricamento' }: { label?: string }) {
  return (
    <div role="status" className="row" style={{ justifyContent: 'center', padding: 'var(--s-8)' }}>
      <Loader2 className="spin accent" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" role="status" aria-label="Caricamento">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 96 }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p className="muted small" style={{ maxWidth: 340 }}>
        {text}
      </p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <div className="ico" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }} aria-hidden="true">
        <AlertCircle />
      </div>
      <h3>Non riesco a caricare</h3>
      <p className="muted small">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Riprova
        </Button>
      )}
    </div>
  );
}

/* ---------- Dialog / sheet ---------- */

export function Sheet({ title, onClose, children, label }: { title: string; onClose: () => void; children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-label={label} ref={ref}>
        <div className="row between">
          <h2 className="display h2" id={titleId}>
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={title} onClose={busy ? () => {} : onClose}>
      <div className="stack-sm muted">{children}</div>
      <div className="stack-sm">
        <Button
          variant={danger ? 'danger' : 'primary'}
          block
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" block disabled={busy} onClick={onClose}>
          Indietro
        </Button>
      </div>
    </Sheet>
  );
}

/* ---------- Toast ---------- */

interface ToastItem {
  id: number;
  kind: 'ok' | 'err';
  text: string;
}
const ToastCtx = createContext<(kind: 'ok' | 'err', text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: 'ok' | 'err', text: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, kind, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'}>
            {t.kind === 'ok' ? <CheckCircle2 size={20} aria-hidden="true" /> : <AlertCircle size={20} aria-hidden="true" />}
            <span className="small">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Caricamento dati ---------- */

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: { message: string; code: string } | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (e: { message?: string; code?: string }) => live && setState({ data: null, error: { message: e?.message ?? 'Errore', code: e?.code ?? 'error' }, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
