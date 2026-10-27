import { CloudRain, Thermometer, Wind } from 'lucide-react';
import type { EventView } from '../../shared/types.ts';
import { fmtTime } from '../format.ts';
import { useSession } from '../session.tsx';
import { useAsync } from '../ui.tsx';

/** Previsione per luogo e ora dell'uscita (Open-Meteo, opzionale). Si richiede una sola volta, solo se l'uscita ha coordinate. */
export function WeatherCard({ e }: { e: EventView }) {
  const { backend } = useSession();
  const on = backend.ext.features.weather && e.lat !== null && e.lng !== null && !e.restricted && !e.isPast && e.status === 'active';
  const { data, error, loading } = useAsync(() => (on ? backend.ext.weather(e.lat!, e.lng!, e.startsAt) : Promise.resolve(null)), [e.id, e.startsAt, e.lat, e.lng, on]);
  if (!on) return null;
  return (
    <section className="card" aria-labelledby="wx">
      <h2 className="section-title" id="wx">Meteo previsto</h2>
      {loading ? <p className="muted small" role="status">Carico le previsioni…</p> : error ? (
        <p className="muted small" role="status">Previsioni non disponibili al momento. {error.message}</p>
      ) : data && data.available && data.hour ? (
        <>
          <p><strong>{data.hour.label}</strong> <span className="muted small">alle {fmtTime(e.startsAt, e.timezone)}</span></p>
          <div className="stats">
            <div className="stat"><span className="v"><Thermometer size={14} aria-hidden="true" /> {data.hour.tempC}°</span><span className="l">Temperatura</span></div>
            <div className="stat"><span className="v"><CloudRain size={14} aria-hidden="true" /> {data.hour.rainProb ?? '—'}{data.hour.rainProb !== null ? '%' : ''}</span><span className="l">Pioggia · {data.hour.rainMm} mm</span></div>
            <div className="stat"><span className="v"><Wind size={14} aria-hidden="true" /> {data.hour.windKmh}</span><span className="l">Vento km/h</span></div>
          </div>
          <p className="attr">{data.fetchedAt ? `Aggiornato alle ${new Date(data.fetchedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · ` : ''}{data.attribution}</p>
        </>
      ) : <p className="muted small" role="status">{data?.reason === 'too_far' ? 'Le previsioni sono disponibili fino a circa 15 giorni prima.' : 'Nessuna previsione disponibile per questo orario.'}</p>}
    </section>
  );
}
