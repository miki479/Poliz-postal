/**
 * Previsioni Open-Meteo. ATTENZIONE alle condizioni: l'API gratuita è solo per uso NON commerciale
 * (limiti: 10.000 chiamate/giorno, 5.000/ora, 600/minuto; attribuzione CC BY 4.0). Per app con abbonamenti,
 * pubblicità o uso commerciale serve il piano a pagamento (OPEN_METEO_API_KEY + base URL "customer-api").
 * Per questo l'integrazione è DISATTIVATA finché non viene abilitata con WEATHER_ENABLED=1.
 */
import { AppError } from '../shared/engine.ts';
import { DailyCap, fetchT, TtlCache } from './util.ts';

export interface WeatherConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}

export function weatherConfig(env: NodeJS.ProcessEnv): WeatherConfig {
  const key = env.OPEN_METEO_API_KEY || '';
  return {
    enabled: env.WEATHER_ENABLED === '1',
    baseUrl: (env.OPEN_METEO_URL || (key ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com')).replace(/\/$/, ''),
    apiKey: key,
  };
}

interface Hourly {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: Array<number | null>;
  precipitation: number[];
  wind_speed_10m: number[];
  weather_code: number[];
}

const cache = new TtlCache<{ hourly: Hourly; fetchedAt: string; tz: string }>(500, 30 * 60_000); // 30 minuti
const cap = new DailyCap(Number(process.env.WEATHER_DAILY_CAP) || 5000); // sotto il limite gratuito di 10.000/giorno

const WMO: Record<number, string> = {
  0: 'Sereno', 1: 'Prevalentemente sereno', 2: 'Parzialmente nuvoloso', 3: 'Coperto', 45: 'Nebbia', 48: 'Nebbia con brina',
  51: 'Pioviggine leggera', 53: 'Pioviggine', 55: 'Pioviggine intensa', 61: 'Pioggia debole', 63: 'Pioggia', 65: 'Pioggia forte',
  71: 'Neve debole', 73: 'Neve', 75: 'Neve forte', 80: 'Rovesci deboli', 81: 'Rovesci', 82: 'Rovesci violenti', 95: 'Temporale', 96: 'Temporale con grandine', 99: 'Temporale con grandine forte',
};

export interface WeatherResult {
  available: boolean;
  reason?: 'past' | 'too_far' | 'no_data';
  hour?: { time: string; tempC: number; rainProb: number | null; rainMm: number; windKmh: number; code: number; label: string };
  fetchedAt?: string;
  attribution: string;
}

const ATTR = 'Dati meteo: Open-Meteo.com (CC BY 4.0)';

export async function forecast(cfg: WeatherConfig, lat: number, lng: number, startsAtIso: string, now = new Date()): Promise<WeatherResult> {
  if (!cfg.enabled) throw new AppError('unavailable', 'Le previsioni meteo non sono attive su questo server.');
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new AppError('validation', 'Coordinate non valide.');
  const t = Date.parse(startsAtIso);
  if (Number.isNaN(t)) throw new AppError('validation', 'Data non valida.');
  if (t < now.getTime() - 3_600_000) return { available: false, reason: 'past', attribution: ATTR };
  if (t > now.getTime() + 15 * 86_400_000) return { available: false, reason: 'too_far', attribution: ATTR };

  // Coordinate arrotondate a ~10 km: più uscite vicine condividono la stessa richiesta (e non si inviano posizioni precise).
  const rl = Math.round(lat * 10) / 10;
  const rn = Math.round(lng * 10) / 10;
  const key = `${rl},${rn}`;
  let entry = cache.get(key);
  if (!entry) {
    if (!cap.take()) throw new AppError('quota', 'Limite giornaliero delle previsioni raggiunto. Riprova domani.');
    const q = new URLSearchParams({ latitude: String(rl), longitude: String(rn), hourly: 'temperature_2m,precipitation_probability,precipitation,wind_speed_10m,weather_code', timezone: 'UTC', forecast_days: '16', wind_speed_unit: 'kmh' });
    if (cfg.apiKey) q.set('apikey', cfg.apiKey);
    let res: Response;
    try {
      res = await fetchT(`${cfg.baseUrl}/v1/forecast?${q}`, { timeoutMs: 8000 });
    } catch {
      throw new AppError('unavailable', 'Previsioni non raggiungibili al momento.');
    }
    if (res.status === 429) throw new AppError('rate_limited', 'Servizio meteo al limite: riprova tra poco.');
    if (!res.ok) throw new AppError('unavailable', 'Previsioni non disponibili al momento.');
    const j = (await res.json()) as { hourly?: Hourly };
    if (!j.hourly?.time?.length) return { available: false, reason: 'no_data', attribution: ATTR };
    entry = { hourly: j.hourly, fetchedAt: new Date().toISOString(), tz: 'UTC' };
    cache.set(key, entry);
  }
  const h = entry.hourly;
  // Ora UTC più vicina all'orario dell'uscita (le ore dell'API sono in UTC: nessun errore di fuso).
  let best = -1;
  let bestD = Infinity;
  h.time.forEach((s, i) => {
    const d = Math.abs(Date.parse(`${s}:00Z`) - t);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best < 0 || bestD > 90 * 60_000 || h.temperature_2m[best] == null) return { available: false, reason: 'no_data', attribution: ATTR };
  const code = h.weather_code[best];
  return {
    available: true,
    hour: { time: `${h.time[best]}:00Z`, tempC: Math.round(h.temperature_2m[best]), rainProb: h.precipitation_probability[best] ?? null, rainMm: Math.round((h.precipitation[best] ?? 0) * 10) / 10, windKmh: Math.round(h.wind_speed_10m[best]), code, label: WMO[code] ?? 'Condizioni variabili' },
    fetchedAt: entry.fetchedAt,
    attribution: ATTR,
  };
}
