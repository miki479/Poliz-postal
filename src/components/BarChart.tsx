import { useId, useState } from 'react';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Seconda serie facoltativa (es. pianificato vs svolto): disegnata come contorno. */
  planned?: number;
}

/**
 * Grafico a barre semplice e accessibile: una tinta (ciano) con codifica secondaria (pieno / contorno),
 * etichette solo sui valori utili, tooltip con tastiera, tabella alternativa sempre disponibile.
 */
export function BarChart({ title, unit, data, height = 140, valueLabel = 'Svolto', plannedLabel = 'Pianificato', format = (n: number) => String(n) }: { title: string; unit: string; data: BarDatum[]; height?: number; valueLabel?: string; plannedLabel?: string; format?: (n: number) => string }) {
  const [active, setActive] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const hasPlanned = data.some((d) => d.planned !== undefined);
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.planned ?? 0)));
  const total = data.reduce((s, d) => s + d.value, 0);
  const W = 320;
  const pad = { t: 18, b: 22, l: 4, r: 4 };
  const slot = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(26, slot - 8);
  const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
  const top = data.reduce((m, d, i) => (d.value > (data[m]?.value ?? -1) ? i : m), 0);
  const sel = data.find((d) => d.key === active);

  return (
    <figure style={{ margin: 0 }} aria-labelledby={`${id}-t`}>
      <figcaption className="row between" style={{ marginBottom: 8 }}>
        <span className="small" id={`${id}-t`} style={{ fontWeight: 650 }}>{title}</span>
        <button type="button" className="pill" style={{ minHeight: 36 }} aria-pressed={table} onClick={() => setTable(!table)}>{table ? 'Grafico' : 'Tabella'}</button>
      </figcaption>
      {total === 0 && !hasPlanned ? (
        <p className="muted small" style={{ padding: '24px 0', textAlign: 'center' }}>Nessun dato in questo periodo.</p>
      ) : table ? (
        <table className="data-table">
          <caption className="sr-only">{title}</caption>
          <thead><tr><th scope="col">Periodo</th>{hasPlanned && <th scope="col">{plannedLabel} ({unit})</th>}<th scope="col">{valueLabel} ({unit})</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.key}><th scope="row">{d.label}</th>{hasPlanned && <td>{format(d.planned ?? 0)}</td>}<td>{format(d.value)}</td></tr>)}</tbody>
        </table>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={`${title}. ${data.map((d) => `${d.label}: ${format(d.value)} ${unit}`).join('; ')}`} style={{ overflow: 'visible' }}>
            <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth="1" />
            {data.map((d, i) => {
              const cx = pad.l + slot * i + slot / 2;
              const h = y(0) - y(d.value);
              const showLabel = d.value > 0 && (i === top || i === data.length - 1);
              return (
                <g key={d.key}>
                  {d.planned !== undefined && d.planned > 0 && (
                    <rect x={cx - bw / 2} y={y(d.planned)} width={bw} height={Math.max(2, y(0) - y(d.planned))} rx="4" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.8" />
                  )}
                  {d.value > 0 && <rect x={cx - bw / 2 + (hasPlanned ? 3 : 0)} y={y(d.value)} width={bw - (hasPlanned ? 6 : 0)} height={Math.max(2, h)} rx="4" fill="var(--accent)" opacity={active && active !== d.key ? 0.45 : 1} />}
                  {showLabel && <text x={cx} y={y(Math.max(d.value, d.planned ?? 0)) - 5} textAnchor="middle" fontSize="11" fill="var(--text-2)" fontWeight="600">{format(d.value)}</text>}
                  <text x={cx} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--text-3)">{d.label}</text>
                  <rect x={pad.l + slot * i} y={pad.t} width={slot} height={height - pad.t} fill="transparent" tabIndex={0} role="button" aria-label={`${d.label}: ${format(d.value)} ${unit}${d.planned !== undefined ? `, ${plannedLabel.toLowerCase()} ${format(d.planned)}` : ''}`} onMouseEnter={() => setActive(d.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(d.key)} onBlur={() => setActive(null)} onClick={() => setActive(active === d.key ? null : d.key)} style={{ cursor: 'pointer', outline: 'none' }} />
                </g>
              );
            })}
          </svg>
          <div className="small" style={{ minHeight: 22 }} aria-live="polite">
            {sel ? <strong>{sel.label}: {format(sel.value)} {unit}{sel.planned !== undefined ? ` · ${plannedLabel.toLowerCase()} ${format(sel.planned)}` : ''}</strong> : <span className="muted xs">Tocca una barra per il dettaglio</span>}
          </div>
          {hasPlanned && (
            <div className="row xs muted" aria-label="Legenda" style={{ gap: 16 }}>
              <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent)', display: 'inline-block' }} /> {valueLabel}</span>
              <span className="row" style={{ gap: 6 }}><i style={{ width: 12, height: 12, borderRadius: 3, border: '1.5px dashed var(--accent)', display: 'inline-block' }} /> {plannedLabel}</span>
            </div>
          )}
        </>
      )}
    </figure>
  );
}
