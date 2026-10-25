import { describe, expect, it } from 'vitest';
import { emptyDb } from '../shared/engine.ts';
import { FirestoreStorage, FileStorage, emptyPersisted, type FirestoreLike, type Persisted } from '../server/storage.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Finto Firestore in memoria: riproduce le sole operazioni usate (get, batch set/delete/commit) e il limite di 500 operazioni per batch. */
class FakeFirestore implements FirestoreLike {
  data = new Map<string, Record<string, unknown>>();
  commits: number[] = [];
  failNextCommit = false;
  collection(name: string) {
    return {
      doc: (id: string) => ({ path: `${name}/${id}` }),
      get: async () => ({ docs: [...this.data.entries()].filter(([k]) => k.startsWith(`${name}/`)).map(([k, v]) => ({ id: k.slice(name.length + 1), data: () => v })) }),
    };
  }
  batch() {
    const ops: Array<() => void> = [];
    return {
      set: (ref: unknown, d: Record<string, unknown>) => ops.push(() => this.data.set((ref as { path: string }).path, d)),
      delete: (ref: unknown) => ops.push(() => this.data.delete((ref as { path: string }).path)),
      commit: async () => {
        if (ops.length > 500) throw new Error('batch troppo grande');
        if (this.failNextCommit) {
          this.failNextCommit = false;
          throw new Error('rete assente');
        }
        this.commits.push(ops.length);
        ops.forEach((o) => o());
      },
    };
  }
}

const user = (id: string) => ({ id, username: id, avatar: null, profileCompleted: true, displayName: id, bio: '', hue: 1, sports: [], area: '', privacy: { showStats: false, showClubs: true, showUpcoming: true, shareActivity: true }, createdAt: '2026-10-23T00:00:00.000Z' });

function sample(): Persisted {
  const p = emptyPersisted();
  p.db.users.usr_a = user('usr_a');
  p.db.users.usr_b = user('usr_b');
  p.accounts.usr_a = { userId: 'usr_a', email: 'a@example.com', emailVerified: false, salt: 'ab', hash: 'cd', createdAt: '2026-10-23T00:00:00.000Z' };
  p.sessions.abc123 = { userId: 'usr_a', expires: 99 };
  p.ai.usage['usr_a__2026-10-23'] = { userId: 'usr_a', day: '2026-10-23', count: 2 };
  p.ai.global = { day: '2026-10-23', count: 2 };
  p.db.routes.rte_1 = { id: 'rte_1', ownerId: 'usr_a', name: 'Giro', geometry: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] } as never;
  return p;
}

describe('FirestoreStorage', () => {
  it('salva e ricarica l’attrezzatura nella tabella dedicata', async () => {
    const fs = new FakeFirestore(); const storage = new FirestoreStorage(fs, 'gear_');
    const p = sample();
    p.db.gear.scarpe = { id: 'scarpe', userId: 'usr_a', name: 'Scarpe strada', sport: 'running', initialKm: null, retired: false, createdAt: '2026-10-25T12:00:00Z', updatedAt: '2026-10-25T12:00:00Z' };
    await storage.save(p);
    expect((await new FirestoreStorage(fs, 'gear_').load()).db.gear).toEqual(p.db.gear);
    expect(fs.data.has('gear_db_gear/scarpe')).toBe(true);
  });
  it('conserva gli inviti alle uscite nella nuova tabella', async () => {
    const fs = new FakeFirestore(); const storage = new FirestoreStorage(fs, 'inv_');
    const p = sample();
    p.db.eventInvites.einv_1 = { id: 'einv_1', eventId: 'event', fromId: 'usr_a', toId: 'usr_b', status: 'pending', createdAt: '2026-10-25T12:00:00Z', respondedAt: null };
    await storage.save(p);
    expect((await new FirestoreStorage(fs, 'inv_').load()).db.eventInvites).toEqual(p.db.eventInvites);
    expect(fs.data.has('inv_db_eventInvites/einv_1')).toBe(true);
  });
  it('salva e ricarica lo stato identico (round trip)', async () => {
    const fs = new FakeFirestore();
    const a = new FirestoreStorage(fs, 'test_');
    await a.save(sample());
    const b = new FirestoreStorage(fs, 'test_');
    expect(await b.load()).toEqual(sample());
    // nessun dato fuori dal prefisso e ogni record è un documento {v, json}
    expect([...fs.data.keys()].every((k) => k.startsWith('test_'))).toBe(true);
    expect(fs.data.get('test_db_users/usr_a')).toEqual({ v: 1, json: JSON.stringify(user('usr_a')) });
  });

  it('scrive solo i documenti cambiati e cancella quelli rimossi', async () => {
    const fs = new FakeFirestore();
    const s = new FirestoreStorage(fs, 't_');
    const p = sample();
    await s.save(p);
    const first = fs.commits.reduce((x, y) => x + y, 0);
    expect(first).toBe(7); // 2 utenti + 1 account + 1 sessione + 1 percorso + 1 uso AI + 1 contatore globale
    fs.commits.length = 0;
    await s.save(p); // nessuna modifica → nessuna scrittura
    expect(fs.commits).toEqual([]);
    p.db.users.usr_a.displayName = 'Anna';
    delete p.db.users.usr_b;
    delete p.sessions.abc123;
    await s.save(p);
    expect(fs.commits).toEqual([3]); // 1 aggiornamento + 2 cancellazioni
    expect(fs.data.has('t_db_users/usr_b')).toBe(false);
    expect(JSON.parse((fs.data.get('t_db_users/usr_a') as { json: string }).json).displayName).toBe('Anna');
  });

  it('divide in più batch sotto il limite di 500 operazioni', async () => {
    const fs = new FakeFirestore();
    const s = new FirestoreStorage(fs, 't_');
    const p = emptyPersisted();
    for (let i = 0; i < 1234; i++) p.db.users[`usr_${i}`] = user(`usr_${i}`);
    await s.save(p);
    expect(fs.commits).toEqual([400, 400, 400, 34]);
    expect((await new FirestoreStorage(fs, 't_').load()).db.users).toHaveProperty('usr_1233');
  });

  it('se un batch fallisce non perde le differenze: il salvataggio successivo le riscrive', async () => {
    const fs = new FakeFirestore();
    const s = new FirestoreStorage(fs, 't_');
    const p = sample();
    await s.save(p);
    p.db.users.usr_c = user('usr_c');
    fs.failNextCommit = true;
    await expect(s.save(p)).rejects.toThrow('rete assente');
    expect(fs.data.has('t_db_users/usr_c')).toBe(false);
    await s.save(p); // riprova
    expect(fs.data.has('t_db_users/usr_c')).toBe(true);
  });

  it('un database vuoto si carica come stato vuoto', async () => {
    expect(await new FirestoreStorage(new FakeFirestore(), 't_').load()).toEqual(emptyPersisted());
    expect(emptyPersisted().db).toEqual(emptyDb());
  });
});

describe('FileStorage', () => {
  it('salva e ricarica, e tollera file con collezioni mancanti (versioni precedenti)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'podismo-fs-'));
    const f = new FileStorage(join(d, 'sub', 'db.json'));
    expect(await f.load()).toEqual(emptyPersisted());
    await f.save(sample());
    expect(await new FileStorage(join(d, 'sub', 'db.json')).load()).toEqual(sample());
    rmSync(d, { recursive: true, force: true });
  });
});
