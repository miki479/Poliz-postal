/**
 * Persistenza del server. Il motore lavora su uno stato in memoria (sincrono, quindi atomico per le regole dei posti);
 * qui si decide dove salvarlo: file JSON (sviluppo, piccoli gruppi) oppure Firestore (Cloud Run).
 *
 * Con Firestore ogni record è un documento `{ v, json }`. Ad ogni salvataggio si scrivono SOLO i documenti cambiati
 * (confronto con l'ultimo stato salvato) e si cancellano quelli rimossi. Se un batch fallisce lo stato "salvato" non
 * avanza: il salvataggio successivo riprova le stesse differenze. Pensato per UNA sola istanza (maxInstances=1).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyDb } from '../shared/engine.ts';
import type { DbState } from '../shared/types.ts';
import type { AiStore } from './ai.ts';
import type { StravaLink } from './strava.ts';

/** Credenziali e contatti: restano SOLO qui, mai nel database applicativo né nelle viste. */
export interface Account {
  userId: string;
  email: string;
  emailVerified: boolean;
  salt?: string;
  hash?: string;
  google?: string;
  apple?: string;
  /** Collegamento Strava: token cifrati a riposo, mai esposti al client. */
  strava?: StravaLink;
  createdAt: string;
}
export interface TokenRec {
  userId: string;
  type: 'reset' | 'verify';
  expires: number;
}
export interface Persisted {
  db: DbState;
  accounts: Record<string, Account>; // chiave: userId
  sessions: Record<string, { userId: string; expires: number }>; // chiave: sha256(token)
  tokens: Record<string, TokenRec>; // chiave: sha256(token)
  /** Utilizzo AI per account/giorno (quota verificata lato server). */
  ai: AiStore;
}

export const emptyPersisted = (): Persisted => ({ db: emptyDb(), accounts: {}, sessions: {}, tokens: {}, ai: { usage: {}, global: { day: '', count: 0 } } });

export interface Storage {
  kind: 'file' | 'firestore';
  load(): Promise<Persisted>;
  save(p: Persisted): Promise<void>;
}

/* ---------- file JSON ---------- */

export class FileStorage implements Storage {
  kind = 'file' as const;
  private file: string;
  constructor(file: string) {
    this.file = file;
  }
  async load(): Promise<Persisted> {
    if (!existsSync(this.file)) return emptyPersisted();
    try {
      const p = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Persisted>;
      const base = emptyPersisted();
      return { db: { ...base.db, ...(p.db ?? {}) }, accounts: p.accounts ?? {}, sessions: p.sessions ?? {}, tokens: p.tokens ?? {}, ai: p.ai ?? base.ai };
    } catch (err) {
      throw new Error(`Impossibile leggere ${this.file}: ${(err as Error).message}`);
    }
  }
  async save(p: Persisted): Promise<void> {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(p), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

/* ---------- Firestore ---------- */

/** Sottoinsieme dell'API di Firestore che usiamo (permette di testare con un finto database). */
export interface FirestoreLike {
  collection(name: string): {
    doc(id: string): unknown;
    get(): Promise<{ docs: Array<{ id: string; data(): Record<string, unknown> }> }>;
  };
  batch(): { set(ref: unknown, data: Record<string, unknown>): unknown; delete(ref: unknown): unknown; commit(): Promise<unknown> };
}

type Records = Record<string, unknown>;
const BATCH = 400; // il limite di Firestore è 500 operazioni per batch

const DB_TABLES = ['users', 'clubs', 'memberships', 'events', 'participations', 'activities', 'notifications', 'challenges', 'challengeParticipants', 'routes', 'routeFavorites', 'plans', 'sessions', 'workoutLogs', 'routines', 'checkins', 'planStates', 'planChanges', 'goals', 'recognitions', 'recognitionRounds', 'reports', 'follows', 'sparks', 'comments', 'clubInvites', 'eventInvites'] as const;

export class FirestoreStorage implements Storage {
  kind = 'firestore' as const;
  private fs: FirestoreLike;
  private prefix: string;
  /** Ultimo stato scritto con successo: "collezione/id" → json. */
  private saved = new Map<string, string>();
  constructor(fs: FirestoreLike, prefix = 'podismo_') {
    this.fs = fs;
    this.prefix = prefix;
  }

  private coll = (name: string) => `${this.prefix}${name}`;

  private async readAll(name: string): Promise<Records> {
    const out: Records = {};
    const snap = await this.fs.collection(this.coll(name)).get();
    for (const d of snap.docs) {
      const json = d.data().json;
      if (typeof json !== 'string') continue;
      this.saved.set(`${this.coll(name)}/${d.id}`, json);
      out[d.id] = JSON.parse(json);
    }
    return out;
  }

  async load(): Promise<Persisted> {
    const p = emptyPersisted();
    this.saved.clear();
    const dbRecords = await Promise.all(DB_TABLES.map((t) => this.readAll(`db_${t}`)));
    DB_TABLES.forEach((t, i) => ((p.db as unknown as Record<string, Records>)[t] = dbRecords[i]));
    [p.accounts, p.sessions, p.tokens, p.ai.usage] = (await Promise.all([this.readAll('auth_accounts'), this.readAll('auth_sessions'), this.readAll('auth_tokens'), this.readAll('ai_usage')])) as [never, never, never, never];
    const g = await this.readAll('ai_global');
    if (g.global) p.ai.global = g.global as AiStore['global'];
    return p;
  }

  /** Stato corrente → mappa "collezione/id" → json. */
  private flatten(p: Persisted): Map<string, string> {
    const m = new Map<string, string>();
    const add = (name: string, rec: Records) => {
      for (const [id, v] of Object.entries(rec)) m.set(`${this.coll(name)}/${id}`, JSON.stringify(v));
    };
    for (const t of DB_TABLES) add(`db_${t}`, (p.db as unknown as Record<string, Records>)[t] ?? {});
    add('auth_accounts', p.accounts);
    add('auth_sessions', p.sessions);
    add('auth_tokens', p.tokens);
    add('ai_usage', p.ai.usage);
    if (p.ai.global.day) add('ai_global', { global: p.ai.global });
    return m;
  }

  async save(p: Persisted): Promise<void> {
    const now = this.flatten(p);
    const ops: Array<{ key: string; json: string | null }> = [];
    for (const [k, json] of now) if (this.saved.get(k) !== json) ops.push({ key: k, json });
    for (const k of this.saved.keys()) if (!now.has(k)) ops.push({ key: k, json: null });
    for (let i = 0; i < ops.length; i += BATCH) {
      const chunk = ops.slice(i, i + BATCH);
      const batch = this.fs.batch();
      for (const op of chunk) {
        const cut = op.key.indexOf('/');
        const ref = this.fs.collection(op.key.slice(0, cut)).doc(op.key.slice(cut + 1));
        if (op.json === null) batch.delete(ref);
        else batch.set(ref, { v: 1, json: op.json });
      }
      await batch.commit();
      // Solo dopo l'esito positivo del batch lo stato "salvato" avanza.
      for (const op of chunk) {
        if (op.json === null) this.saved.delete(op.key);
        else this.saved.set(op.key, op.json);
      }
    }
  }
}

/** STORAGE=firestore usa Firestore (credenziali dell'ambiente, es. Cloud Run); altrimenti file JSON. */
export async function storageFromEnv(env: NodeJS.ProcessEnv, dataFile: string): Promise<Storage> {
  if (env.STORAGE !== 'firestore') return new FileStorage(dataFile);
  const { Firestore } = await import('@google-cloud/firestore');
  const fs = new Firestore({ projectId: env.FIRESTORE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || undefined, databaseId: env.FIRESTORE_DATABASE_ID || '(default)', ignoreUndefinedProperties: true });
  return new FirestoreStorage(fs as unknown as FirestoreLike, env.FIRESTORE_PREFIX || 'podismo_');
}
