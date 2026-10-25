import { Activity, BedDouble, Dumbbell, Footprints, Leaf, PersonStanding, Plus, Trash2 } from 'lucide-react';
import { EQUIPMENT_LABEL, EXERCISES, KIND_LABEL, kindGroup, MUSCLE_LABEL, type KindGroup } from '../../shared/exercises.ts';
import type { PlannedExercise, Segment, SessionKind, SessionStatus } from '../../shared/types.ts';
import { Button } from '../ui.tsx';

const ICON: Record<KindGroup, typeof Footprints> = { run: Footprints, walk: PersonStanding, strength: Dumbbell, aerobic: Activity, recovery: BedDouble };
export const GROUP_CLASS: Record<KindGroup, string> = { run: 'kind-run', walk: 'kind-walk', strength: 'kind-strength', aerobic: 'kind-aerobic', recovery: 'kind-recovery' };

export function KindBadge({ kind, size = 40 }: { kind: SessionKind; size?: number }) {
  const g = kindGroup(kind);
  const I = kind === 'mobility' ? Leaf : ICON[g];
  return (
    <span className={`kind-badge ${GROUP_CLASS[g]}`} style={{ width: size, height: size }} role="img" aria-label={KIND_LABEL[kind]}>
      <I size={size * 0.5} aria-hidden="true" />
    </span>
  );
}

export const STATUS_LABEL: Record<SessionStatus, { label: string; cls: string }> = {
  planned: { label: 'Programmata', cls: '' },
  completed: { label: 'Completata', cls: 'success' },
  skipped: { label: 'Saltata', cls: 'danger' },
  rescheduled: { label: 'Riprogrammata', cls: 'accent' },
  paused: { label: 'In pausa', cls: '' },
};

export function fmtDurSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m && s) return `${m} min ${s} s`;
  return m ? `${m} min` : `${s} s`;
}

export interface SegGroup {
  reps: number;
  items: Segment[];
}

/** Raggruppa i blocchi che si ripetono insieme (es. corsa + camminata × 8). */
export function groupSegments(segs: Segment[]): SegGroup[] {
  const out: SegGroup[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.reps > 1) {
      const items = [s];
      while (i + 1 < segs.length && segs[i + 1].reps === s.reps && (segs[i + 1].kind === 'walk' || segs[i + 1].kind === 'recovery')) items.push(segs[++i]);
      out.push({ reps: s.reps, items });
    } else out.push({ reps: 1, items: [s] });
  }
  return out;
}

/** Sequenza lineare dei blocchi (con ripetizioni espanse), usata dalla guida del cronometro. */
export function flattenSegments(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const g of groupSegments(segs)) for (let r = 0; r < g.reps; r++) for (const it of g.items) out.push({ ...it, reps: 1 });
  return out;
}

export function SegmentList({ segments }: { segments: Segment[] }) {
  if (!segments.length) return null;
  return (
    <ul className="seg-list" aria-label="Fasi della sessione">
      {groupSegments(segments).map((g, i) => (
        <li key={i}>
          <span className="num accent" style={{ minWidth: 34 }}>{g.reps > 1 ? `${g.reps}×` : ''}</span>
          <span className="grow small">{g.items.map((it) => `${fmtDurSec(it.durationSec)} ${it.label.toLowerCase()}`).join(' + ')}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- editor esercizi ---------- */

export function ExerciseEditor({ value, onChange, routines }: { value: PlannedExercise[]; onChange: (v: PlannedExercise[]) => void; routines?: Array<{ id: string; name: string; exercises: PlannedExercise[] }> }) {
  const upd = (i: number, patch: Partial<PlannedExercise>) => onChange(value.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  return (
    <div className="stack">
      {value.map((e, i) => (
        <div key={i} className="card" style={{ gap: 8 }}>
          <div className="row between">
            <strong className="small">{e.name}</strong>
            <button type="button" className="icon-btn" aria-label={`Rimuovi ${e.name}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><Trash2 size={18} /></button>
          </div>
          <span className="xs muted">{MUSCLE_LABEL[e.muscle]} · {EQUIPMENT_LABEL[e.equipment]}</span>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {([['sets', 'Serie'], ['reps', 'Rip.'], ['loadKg', 'Kg'], ['restSec', 'Rec. s']] as const).map(([k, l]) => (
              <label key={k} className="field"><span className="xs muted">{l}</span>
                <input className="input" style={{ padding: '0 8px' }} inputMode="decimal" aria-label={`${l} ${e.name}`} value={e[k] === null ? '' : String(e[k])} onChange={(ev) => { const t = ev.target.value.replace(',', '.'); upd(i, { [k]: t === '' ? (k === 'loadKg' ? null : 0) : Number(t) } as Partial<PlannedExercise>); }} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="row wrap">
        <select className="select grow" aria-label="Aggiungi un esercizio dalla libreria" value="" onChange={(ev) => { const d = EXERCISES.find((x) => x.name === ev.target.value); if (d) onChange([...value, { name: d.name, muscle: d.muscle, equipment: d.equipment, sets: 3, reps: 10, loadKg: null, restSec: 90 }]); }}>
          <option value="">+ Aggiungi esercizio…</option>
          {(Object.keys(MUSCLE_LABEL) as Array<keyof typeof MUSCLE_LABEL>).map((m) => <optgroup key={m} label={MUSCLE_LABEL[m]}>{EXERCISES.filter((x) => x.muscle === m).map((x) => <option key={x.name} value={x.name}>{x.name} ({EQUIPMENT_LABEL[x.equipment]})</option>)}</optgroup>)}
        </select>
        {routines && routines.length > 0 && (
          <select className="select grow" aria-label="Usa una routine salvata" value="" onChange={(ev) => { const r = routines.find((x) => x.id === ev.target.value); if (r) onChange([...value, ...r.exercises]); }}>
            <option value="">Usa una routine…</option>
            {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

/* ---------- editor segmenti ---------- */

const SEG_LABEL: Record<Segment['kind'], string> = { warmup: 'Riscaldamento', run: 'Corsa', walk: 'Camminata', work: 'Ripetuta', recovery: 'Recupero', cooldown: 'Defaticamento' };

export function SegmentEditor({ value, onChange }: { value: Segment[]; onChange: (v: Segment[]) => void }) {
  const upd = (i: number, patch: Partial<Segment>) => onChange(value.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div className="stack">
      {value.map((s, i) => (
        <div key={i} className="card" style={{ gap: 8 }}>
          <div className="row between">
            <select className="select" style={{ maxWidth: 220 }} aria-label={`Tipo blocco ${i + 1}`} value={s.kind} onChange={(e) => upd(i, { kind: e.target.value as Segment['kind'], label: SEG_LABEL[e.target.value as Segment['kind']] })}>
              {(Object.keys(SEG_LABEL) as Array<Segment['kind']>).map((k) => <option key={k} value={k}>{SEG_LABEL[k]}</option>)}
            </select>
            <button type="button" className="icon-btn" aria-label={`Rimuovi blocco ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><Trash2 size={18} /></button>
          </div>
          <div className="form-grid">
            <label className="field"><span className="xs muted">Durata (minuti)</span><input className="input" inputMode="decimal" aria-label={`Minuti blocco ${i + 1}`} value={String(s.durationSec / 60).replace('.', ',')} onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n)) upd(i, { durationSec: Math.round(n * 60) }); }} /></label>
            <label className="field"><span className="xs muted">Ripetizioni</span><input className="input" inputMode="numeric" aria-label={`Ripetizioni blocco ${i + 1}`} value={String(s.reps)} onChange={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1) upd(i, { reps: n }); }} /></label>
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={() => onChange([...value, { kind: 'run', label: 'Corsa', durationSec: 300, reps: 1 }])}><Plus size={18} aria-hidden="true" /> Aggiungi blocco</Button>
    </div>
  );
}
