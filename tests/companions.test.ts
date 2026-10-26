import { describe, expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import type { TrackPoint, UserPublic, WorkoutLog } from '../shared/types.ts';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const line = (lat0: number, lng0: number, km: number): TrackPoint[] => Array.from({ length: 41 }, (_, i) => ({ lat: lat0 + ((km / 111.2) * i) / 40, lng: lng0, t: i * 9 }));

function setup() {
  const db = emptyDb();
  for (const id of ['a', 'b', 'c', 'd']) db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: 'U' + id, bio: '', hue: 1, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
  const log = (id: string, user: string, start: string, track: TrackPoint[], shared = true): WorkoutLog => (db.workoutLogs[id] = { id, userId: user, plannedSessionId: null, kind: 'run_free', title: 'Corsa', startedAt: start, durationSec: 1800, distanceKm: 4, paceSecPerKm: 450, rpe: null, difficulties: '', notes: '', sets: [], mode: 'timer', activityId: null, shared, track, createdAt: start, updatedAt: start });
  return { db, log };
}
const as = (db: Ctx['db'], a: string): Ctx => ({ db, now: NOW, actorId: a });

describe('con chi hai corso', () => {
  it('propone chi ha fatto lo stesso tragitto ma non conferma senza consenso', () => {
    const { db, log } = setup();
    log('la', 'a', '2026-10-24T07:00:00.000Z', line(45, 7.7, 4));
    log('lb', 'b', '2026-10-24T07:04:00.000Z', line(45.0002, 7.7001, 4)); // stesso percorso, partenza a 4 minuti
    log('lc', 'c', '2026-10-24T09:00:00.000Z', line(45, 7.7, 4)); // stesso percorso, due ore dopo
    log('ld', 'd', '2026-10-24T07:01:00.000Z', line(45, 7.75, 4)); // stessa ora, strada diversa
    call(as(db,'a'),'follow',['b']);
    const r = call(as(db,'a'),'workoutCompanionContext',['la']) as {user:UserPublic;suggested:boolean}[];
    expect(r.filter((c)=>c.suggested).map((c)=>c.user.id)).toEqual(['b']);
    expect(call(as(db,'a'),'runCompanions',['la'])).toEqual([]);
  });

  it('privacy: niente abbinamento se uno dei due non condivide', () => {
    const { db, log } = setup();
    log('la', 'a', '2026-10-24T07:00:00.000Z', line(45, 7.7, 4));
    log('lb', 'b', '2026-10-24T07:02:00.000Z', line(45, 7.7, 4), false);
    expect(call(as(db, 'a'), 'runCompanions', ['la'])).toEqual([]);
    db.workoutLogs.lb.shared = true;
    db.users.b.privacy.shareActivity = false;
    expect(call(as(db, 'a'), 'runCompanions', ['la'])).toEqual([]);
    db.users.b.privacy.shareActivity = true;
    db.workoutLogs.la.shared = false; // anche chi chiede deve condividere
    expect(call(as(db, 'a'), 'runCompanions', ['la'])).toEqual([]);
  });
});

describe('compagni manuali confermati',()=>{
 const prepare=()=>{const s=setup();s.log('la','a','2026-10-24T07:00:00Z',[],false);call(as(s.db,'a'),'follow',['b']);return s;};
 it('seguire è immediato e il destinatario può rimuovere il follower',()=>{
  const {db}=prepare();expect(Object.values(db.follows).some((f)=>f.fromId==='a'&&f.toId==='b')).toBe(true);
  call(as(db,'b'),'removeFollower',['a']);expect(Object.values(db.follows)).toHaveLength(0);
 });
 it('non duplica richieste e chiede conferma solo ad amici seguiti',()=>{
  const {db}=prepare();const r=call(as(db,'a'),'requestWorkoutCompanion',['la','b']) as {id:string};
  expect(call(as(db,'a'),'requestWorkoutCompanion',['la','b'])).toMatchObject({id:r.id});
  expect(Object.values(db.workoutCompanions)).toHaveLength(1);
  expect(()=>call(as(db,'a'),'requestWorkoutCompanion',['la','c'])).toThrow();
  expect(()=>call(as(db,'b'),'requestWorkoutCompanion',['la','a'])).toThrow();
 });
 it('solo il destinatario conferma; solo i confermati entrano nel racconto',()=>{
  const {db}=prepare();const r=call(as(db,'a'),'requestWorkoutCompanion',['la','b']) as {id:string};
  expect(call(as(db,'a'),'runCompanions',['la'])).toEqual([]);
  expect(()=>call(as(db,'c'),'respondWorkoutCompanion',[r.id,true])).toThrow();
  expect(()=>call(as(db,'a'),'respondWorkoutCompanion',[r.id,true])).toThrow();
  call(as(db,'b'),'respondWorkoutCompanion',[r.id,true]);
  expect((call(as(db,'a'),'runCompanions',['la']) as UserPublic[]).map((u)=>u.id)).toEqual(['b']);
  call(as(db,'b'),'removeWorkoutCompanion',[r.id]);
  expect(call(as(db,'a'),'runCompanions',['la'])).toEqual([]);
 });
 it('rispetta il rifiuto e non rivela dati privati o Strava al destinatario',()=>{
  const {db}=prepare();db.workoutLogs.la.origin='strava';db.workoutLogs.la.title='Titolo riservato';
  const r=call(as(db,'a'),'requestWorkoutCompanion',['la','b']) as {id:string};
  const inbox=call(as(db,'b'),'myWorkoutCompanionRequests',[]);
  expect(JSON.stringify(inbox)).not.toMatch(/Titolo riservato|logId|track|distance|startedAt/);
  call(as(db,'b'),'respondWorkoutCompanion',[r.id,false]);
  expect(()=>call(as(db,'a'),'requestWorkoutCompanion',['la','b'])).toThrow();
  const later={...as(db,'a'),now:new Date(NOW.getTime()+31*86400000)};
  expect(call(later,'requestWorkoutCompanion',['la','b'])).toMatchObject({status:'pending'});
 });
 it('esclude tipi di consenso non booleani e pulisce i collegamenti con l’account',()=>{
  const {db}=prepare();const r=call(as(db,'a'),'requestWorkoutCompanion',['la','b']) as {id:string};
  expect(()=>call(as(db,'b'),'respondWorkoutCompanion',[r.id,'true'])).toThrow();
  call(as(db,'b'),'deleteAccount',[]);expect(Object.values(db.workoutCompanions)).toHaveLength(0);
 });
});
