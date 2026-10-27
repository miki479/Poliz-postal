import type { Api } from '../../shared/api.ts';
import type { Me } from '../../shared/types.ts';

export interface AuthConfig {
  registrationCodeRequired: boolean;
  /** Invio email attivo sul server (recupero password e verifica). */
  emailEnabled: boolean;
  googleClientId: string | null;
  appleClientId: string | null;
  appleRedirectUri: string | null;
}

export interface AccountInfo {
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  google: boolean;
  apple: boolean;
  mailEnabled: boolean;
}

export interface AuthApi {
  /** "server" = backend reale con account veri; "demo" = backend assente, dati solo su questo dispositivo. */
  mode: 'server' | 'demo';
  config: AuthConfig;
  register(p: { email: string; password: string; registrationCode?: string }): Promise<Me>;
  login(p: { email: string; password: string }): Promise<Me>;
  google(idToken: string): Promise<{ user: Me; created: boolean }>;
  apple(idToken: string, name?: string): Promise<{ user: Me; created: boolean }>;
  logout(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
  resendVerification(): Promise<void>;
  account(): Promise<AccountInfo>;
  changePassword(current: string, password: string): Promise<void>;
  deleteAccount(p: { password?: string; confirm?: string }): Promise<void>;
  usernameAvailable(username: string): Promise<boolean>;
  /** Solo demo: profilo locale dichiarato come tale (nessun account reale). */
  demoEnter?(): Promise<Me>;
  resetDemo?(): void;
}

export interface Features {
  strava: boolean;
  geocoding: boolean;
  routing: boolean;
  weather: boolean;
  ai: boolean;
}

export interface SyncSummary {
  at: string;
  imported: number;
  updated: number;
  duplicates: number;
  skipped: number;
  pages: number;
  partial: boolean;
  rateLimited: boolean;
  error: 'revoked' | 'strava_error' | 'network' | 'budget' | null;
}

export interface StravaStatus {
  configured: boolean;
  reason: string | null;
  scope: string;
  connected: boolean;
  revoked: boolean;
  athleteId: number | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSync: SyncSummary | null;
  grantedScope: string | null;
}

export interface AiStatus {
  configured: boolean;
  reason: string | null;
  dailyLimit: number;
  used: number;
  remaining: number;
  serviceAvailable: boolean;
}

export interface AiAnswer {
  text: string;
  generic: boolean;
  simulated: boolean;
  remaining: number;
}

export interface WeatherResult {
  available: boolean;
  reason?: 'past' | 'too_far' | 'no_data';
  hour?: { time: string; tempC: number; rainProb: number | null; rainMm: number; windKmh: number; code: number; label: string };
  fetchedAt?: string;
  attribution: string;
}

export interface GeoPlace {
  name: string;
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceKm: number;
  geometry: Array<{ lat: number; lng: number }>;
  steps: Array<{ text: string; distanceKm: number }>;
  provider: string;
  attribution: string;
}

/** Integrazioni opzionali: ogni funzione è disponibile solo se il server la ha configurata (vedi `features`). */
export interface ExtApi {
  features: Features;
  map: { tileUrl: string; attribution: string };
  strava: {
    status(): Promise<StravaStatus>;
    connect(): Promise<string>;
    sync(): Promise<{ summary: SyncSummary; status: StravaStatus }>;
    disconnect(deleteData: boolean): Promise<{ deleted: number }>;
  };
  geo: {
    search(q: string): Promise<{ results: GeoPlace[]; cached: boolean }>;
    route(points: Array<{ lat: number; lng: number }>): Promise<RouteResult>;
  };
  weather(lat: number, lng: number, startsAt: string): Promise<WeatherResult>;
  ai: {
    status(): Promise<AiStatus>;
    chat(p: { prompt: string; preset: string; useData: boolean }): Promise<AiAnswer>;
  };
}

export type Backend = Api & { auth: AuthApi; ext: ExtApi };

export class ApiError extends Error {
  code: string;
  fields: Record<string, string> | undefined;
  constructor(code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
  }
}
