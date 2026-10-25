import { beforeEach, describe, expect, it } from 'vitest';

import { ACTIVITY_STYLES, gradientFor, styleOfSport } from '../mobile/src/constants/activityColors.ts';
import { stravaSportOf } from '../server/strava.ts';
import { findDuplicate, newActivity } from '../shared/activities.ts';
import * as E from '../shared/engine.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import { DISTANCE_LIMITS, DISTANCE_TICKS, PACE_LIMITS, PACE_SCALE, estimateLevel, eventSportOf, hasPaceScale, type EventSport } from '../shared/eventLevel.ts';
import { parseGpx, sportFromText } from '../shared/importers.ts';
import { PACT_MODES, PACT_TEXT, pactBlocker, pactHasConflict, pactModes } from '../shared/pact.ts';
import { activityAwards, allAwards, currentRecords, groupOf, nextTargets } from '../shared/records.ts';
import { ENABLED_SPORTS, isRunFamily, sportDef, sportFamily } from '../shared/sports.ts';
import { getStats } from '../shared/stats.ts';
import { alignStoryLog, ensureStoryLog, metricsFromSummary } from '../shared/stravaStories.ts';
import type { DbState, EventInput, RunEvent, RunPact, User, WorkoutLog } from '../shared/types.ts';
import { PACT_CONFLICT, normalizePact, validateActivityInput, validateClubInput, validateEventInput } from '../shared/validation.ts';

const NOW = new Date('2026-10-23T10:00:00.000Z');

/**
 * Icone delle uscite nell'app. eventStyle.ts usa i tipi di @expo/vector-icons: importarlo in modo statico porterebbe i tipi
 * globali di React Native nel controllo dei tipi della root (server compreso). A runtime il modulo è puro: si carica dinamicamente.
 */
interface IconDef {
  icon: string;
  label: string;
  hint: string;
}
interface EventStyleModule {
  EVENT_SPORTS: readonly string[];
  PACT_ICON: string;
  PACT_ICONS: Record<string, IconDef>;
  VISIBILITY_ICONS: Record<string, IconDef>;
  FEATURE_ICONS: Record<string, IconDef>;
}
const EVENT_STYLE = '../mobile/src/constants/eventStyle.ts';
const eventStyle = () => import(/* @vite-ignore */ EVENT_STYLE) as Promise<EventStyleModule>;

function input(over: Partial<EventInput> = {}): EventInput {
  return {
    title: 'Uscita del giovedì',
    sport: 'running',
    startsAt: '2026-10-25T17:30:00.000Z',
    timezone: 'Europe/Rome',
    meetingPlace: 'Ingresso del parco',
    area: 'Forlì',
    lat: null,
    lng: null,
    distanceKm: 8,
    paceSecPerKm: 330,
    level: 'medium',
    notes: '',
    maxParticipants: null,
    visibility: 'public',
    clubId: null,
    routeId: null,
    ...over,
  };
}

/* ---------------------------------------------------------------------- */
describe('nuovi tipi di attività e di uscita', () => {
  it('trail, corsa + camminata e altro sono abilitati con etichette italiane, gli sport futuri no', () => {
    expect(ENABLED_SPORTS.map((s) => s.id)).toEqual(['running', 'walking', 'trail', 'run_walk', 'other']);
    expect(sportDef('trail').label).toBe('Trail');
    expect(sportDef('run_walk').label).toBe('Corsa + camminata');
    expect(sportDef('other').label).toBe('Altro');
    // il passo si confronta solo per corsa e camminata; "Altro" non entra nei record
    expect(ENABLED_SPORTS.filter((s) => s.paceComparable).map((s) => s.id)).toEqual(['running', 'walking']);
    expect(ENABLED_SPORTS.filter((s) => !s.performance).map((s) => s.id)).toEqual(['other']);
  });

  it('la validazione delle uscite accetta i nuovi tipi e rifiuta quelli non disponibili', () => {
    for (const sport of ['running', 'walking', 'trail', 'run_walk', 'other'] as const) expect(validateEventInput(input({ sport }), NOW).ok, sport).toBe(true);
    for (const sport of ['cycling', 'nuoto', '', null]) {
      const v = validateEventInput(input({ sport: sport as never }), NOW);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.errors.sport).toBe('Scegli uno sport disponibile.');
    }
  });

  it('attività, club e uscita: i nuovi tipi passano ovunque passava la corsa', () => {
    expect(validateActivityInput({ date: NOW.toISOString(), sport: 'trail', distanceKm: 12, durationMin: 95, note: '' }, NOW).ok).toBe(true);
    expect(validateActivityInput({ date: NOW.toISOString(), sport: 'other', distanceKm: null, durationMin: 45, note: '' }, NOW).ok).toBe(true);
    expect(validateClubInput({ name: 'Sentieri del Montone', description: '', sport: 'trail', area: 'Forlì', imageDataUrl: null }).ok).toBe(true);
    expect(validateClubInput({ name: 'Gruppo misto', description: '', sport: 'run_walk', area: '', imageDataUrl: null }).ok).toBe(true);
  });

  it('famiglie: trail e corsa + camminata sono corse, la camminata no', () => {
    expect(sportFamily('trail')).toBe('running');
    expect(sportFamily('run_walk')).toBe('running');
    expect(isRunFamily('walking')).toBe(false);
    expect(isRunFamily('other')).toBe(false);
  });

  it('la stessa uscita come "Corsa" nell\'app e "TrailRun" da Strava è un doppione, una camminata no', () => {
    const db = emptyDb();
    const strava = newActivity(NOW, { userId: 'u', source: 'strava', sport: 'trail', date: '2026-10-20T07:00:00.000Z', distanceKm: 14.2, durationMin: 110, externalId: 'strava:9' });
    db.activities[strava.id] = strava;
    expect(findDuplicate(db, { userId: 'u', sport: 'running', date: '2026-10-20T07:05:00.000Z', dayOnly: false, distanceKm: 14.1, durationMin: 108 })?.id).toBe(strava.id);
    expect(findDuplicate(db, { userId: 'u', sport: 'walking', date: '2026-10-20T07:05:00.000Z', dayOnly: false, distanceKm: 14.1, durationMin: 108 })).toBeNull();
  });
});

/* ---------------------------------------------------------------------- */
describe('patto di corsa: nuove modalità', () => {
  it('a turno e in coppia si salvano, anche insieme ai patti di prima', () => {
    const v = validateEventInput(input({ pact: { noDrop: true, inclusivePace: false, regroupPoints: '', takeTurns: true, pairs: true } }), NOW);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.pact).toEqual({ noDrop: true, inclusivePace: false, regroupPoints: '', takeTurns: true, pairs: true, selfPace: false });
  });

  it('self pace da solo o con i punti di ricompattamento è valido', () => {
    expect(normalizePact({ noDrop: false, inclusivePace: false, regroupPoints: '', selfPace: true })).toMatchObject({ selfPace: true, noDrop: false, inclusivePace: false });
    expect(normalizePact({ noDrop: false, inclusivePace: false, regroupPoints: 'Fontana, km 5', selfPace: true, pairs: true })).toMatchObject({ selfPace: true, pairs: true, regroupPoints: 'Fontana, km 5' });
  });

  it('self pace non si combina con "nessuno resta indietro" né con "ritmo inclusivo": rifiuto con messaggio chiaro', () => {
    for (const pact of [
      { noDrop: true, inclusivePace: false, regroupPoints: '', selfPace: true },
      { noDrop: false, inclusivePace: true, regroupPoints: '', selfPace: true },
      { noDrop: true, inclusivePace: true, regroupPoints: 'km 3', selfPace: true, takeTurns: true },
    ] as RunPact[]) {
      const v = validateEventInput(input({ pact }), NOW);
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.errors.pact).toBe(PACT_CONFLICT);
        expect(v.errors.pact).toMatch(/Self pace/);
        expect(v.errors.pact).toMatch(/Nessuno resta indietro/);
      }
    }
  });

  it('un patto senza nessun impegno vale "nessun patto"; valori non booleani non accendono nulla', () => {
    expect(normalizePact(null)).toBeNull();
    expect(normalizePact({ noDrop: false, inclusivePace: false, regroupPoints: '   ' })).toBeNull();
    expect(normalizePact({ noDrop: 'true', selfPace: 1, takeTurns: 'sì' })).toBeNull();
  });

  describe('retrocompatibilità con i patti già salvati', () => {
    let db: DbState;
    const addUser = (id: string): User => (db.users[id] = { id, username: id, avatar: null, profileCompleted: true, displayName: id, bio: '', hue: 10, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() });
    const as = (actorId: string): Ctx => ({ db, now: NOW, actorId });
    beforeEach(() => {
      db = emptyDb();
      addUser('a');
    });

    it('un patto con i soli campi di prima resta valido e le modalità nuove valgono "no"', () => {
      const old = { noDrop: true, inclusivePace: false, regroupPoints: 'Ponte, km 4' } as RunPact;
      const v = validateEventInput(input({ pact: old }), NOW);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.value.pact).toEqual({ ...old, takeTurns: false, pairs: false, selfPace: false });
      expect(pactModes(old)).toEqual(['noDrop', 'regroupPoints']);
    });

    it('un\'uscita salvata con il patto di prima si legge e si modifica senza perdere nulla', () => {
      const e = E.createEvent(as('a'), input());
      // patto scritto come era salvato prima delle nuove modalità (nessun campo nuovo)
      const stored = db.events[e.id] as RunEvent;
      stored.pact = { noDrop: false, inclusivePace: true, regroupPoints: '' };
      const view = E.getEvent(as('a'), e.id);
      expect(view.pact).toEqual({ noDrop: false, inclusivePace: true, regroupPoints: '' });
      expect(pactModes(view.pact)).toEqual(['inclusivePace']);
      const upd = E.updateEvent(as('a'), e.id, input({ pact: view.pact, title: 'Uscita rinominata' }), view.version);
      expect(upd.pact).toEqual({ noDrop: false, inclusivePace: true, regroupPoints: '', takeTurns: false, pairs: false, selfPace: false });
    });

    it('il server rifiuta self pace con "ritmo inclusivo" anche in modifica, con il motivo sul campo', () => {
      const e = E.createEvent(as('a'), input({ pact: { noDrop: false, inclusivePace: false, regroupPoints: '', selfPace: true } }));
      expect(e.pact?.selfPace).toBe(true);
      let err: AppError | null = null;
      try {
        E.updateEvent(as('a'), e.id, input({ pact: { noDrop: false, inclusivePace: true, regroupPoints: '', selfPace: true } }), e.version);
      } catch (x) {
        err = x as AppError;
      }
      expect(err).toBeInstanceOf(AppError);
      expect(err!.code).toBe('validation');
      expect(err!.fields?.pact).toBe(PACT_CONFLICT);
      expect(db.events[e.id].pact?.inclusivePace).toBe(false); // nulla è stato salvato
    });
  });

  it('nell\'app: 6 modalità, ognuna con icona distinta (anche da visibilità, club e caratteristiche), etichetta e spiegazione', async () => {
    const { PACT_ICONS, VISIBILITY_ICONS, FEATURE_ICONS, PACT_ICON } = await eventStyle();
    expect(PACT_MODES).toEqual(['noDrop', 'inclusivePace', 'regroupPoints', 'takeTurns', 'pairs', 'selfPace']);
    const icons = PACT_MODES.map((m) => PACT_ICONS[m].icon);
    expect(new Set(icons).size).toBe(icons.length);
    const others = [...Object.values(VISIBILITY_ICONS).map((v) => v.icon), ...Object.values(FEATURE_ICONS).map((f) => f.icon), PACT_ICON, 'people', 'people-outline', 'shield-half'];
    for (const i of icons) expect(others).not.toContain(i);
    for (const m of PACT_MODES) {
      expect(PACT_ICONS[m]).toEqual({ icon: expect.stringMatching(/-outline$/), ...PACT_TEXT[m] }); // stessi testi del server
      expect(PACT_ICONS[m].label.length).toBeGreaterThan(3);
      expect(PACT_ICONS[m].hint.length).toBeGreaterThan(10);
    }
    expect(PACT_ICONS.takeTurns.label).toBe('A turno');
    expect(PACT_ICONS.pairs.label).toBe('In coppia');
    expect(PACT_ICONS.selfPace.label).toBe('Self pace');
  });

  it('le modalità incompatibili si bloccano a vicenda, con le stesse regole nell\'app e sul server', () => {
    expect(pactHasConflict({ noDrop: true, inclusivePace: false, regroupPoints: '', selfPace: true })).toBe(true);
    expect(pactHasConflict({ noDrop: false, inclusivePace: false, regroupPoints: '', selfPace: true, pairs: true })).toBe(false);
    expect(pactBlocker('selfPace', ['noDrop'])).toBe('noDrop');
    expect(pactBlocker('selfPace', ['pairs', 'inclusivePace'])).toBe('inclusivePace');
    expect(pactBlocker('noDrop', ['selfPace'])).toBe('selfPace');
    expect(pactBlocker('inclusivePace', ['selfPace', 'takeTurns'])).toBe('selfPace');
    expect(pactBlocker('selfPace', ['takeTurns', 'pairs', 'regroupPoints'])).toBeNull();
    expect(pactBlocker('takeTurns', ['selfPace'])).toBeNull();
    // ogni combinazione permessa dall'app è accettata dal server, e viceversa
    for (let mask = 0; mask < 1 << PACT_MODES.length; mask++) {
      const on = PACT_MODES.filter((_, i) => mask & (1 << i));
      const appOk = on.every((m) => pactBlocker(m, on.filter((x) => x !== m)) === null);
      const raw = { noDrop: on.includes('noDrop'), inclusivePace: on.includes('inclusivePace'), regroupPoints: on.includes('regroupPoints') ? 'km 5' : '', takeTurns: on.includes('takeTurns'), pairs: on.includes('pairs'), selfPace: on.includes('selfPace') };
      expect(normalizePact(raw) !== undefined, on.join('+')).toBe(appOk);
    }
  });

  it('pactModes legge le nuove modalità nell\'ordine stabile', () => {
    expect(pactModes({ noDrop: false, inclusivePace: false, regroupPoints: '', selfPace: true, pairs: true, takeTurns: true })).toEqual(['takeTurns', 'pairs', 'selfPace']);
    expect(pactModes(null)).toEqual([]);
  });
});

/* ---------------------------------------------------------------------- */
describe('Strava: trail e camminata', () => {
  it('TrailRun diventa trail, Run e VirtualRun corsa, Walk e Hike camminata, il resto non si importa', () => {
    expect(stravaSportOf({ sport_type: 'TrailRun', type: 'Run' })).toBe('trail');
    expect(stravaSportOf({ type: 'Run' })).toBe('running'); // vecchie risposte senza sport_type
    expect(stravaSportOf({ sport_type: 'Run' })).toBe('running');
    expect(stravaSportOf({ sport_type: 'VirtualRun' })).toBe('running');
    expect(stravaSportOf({ sport_type: 'Hike', type: 'Hike' })).toBe('walking');
    expect(stravaSportOf({ sport_type: 'Walk' })).toBe('walking');
    expect(stravaSportOf({ sport_type: 'Ride' })).toBeNull();
    expect(stravaSportOf({})).toBeNull();
  });

  it('il racconto di un trail è una corsa con il segno trail; la cadenza si raddoppia come per la corsa', () => {
    const db = emptyDb();
    const a = newActivity(NOW, { userId: 'u', source: 'strava', sport: 'trail', date: '2026-10-20T07:00:00.000Z', distanceKm: 14.2, durationMin: 110, externalId: 'strava:9' });
    db.activities[a.id] = a;
    expect(ensureStoryLog(db, a, '_p~iF~ps|U_ulLnnqC_mqNvxq`@', NOW)).toBe(true);
    const log = Object.values(db.workoutLogs)[0];
    expect(log).toMatchObject({ sport: 'running', trail: true, kind: 'run_free', title: 'Trail', origin: 'strava' });
    expect(groupOf(log)).toBe('trail');
    expect(metricsFromSummary({ average_cadence: 80 }, 'trail').cadenceSpm).toBe(160);
    expect(metricsFromSummary({ average_cadence: 80 }, 'walking').cadenceSpm).toBe(80);
  });

  it('una corsa importata prima e poi riconosciuta come trail allinea il racconto (e viceversa)', () => {
    const db = emptyDb();
    const a = newActivity(NOW, { userId: 'u', source: 'strava', sport: 'running', date: '2026-10-20T07:00:00.000Z', distanceKm: 10, durationMin: 60, externalId: 'strava:10' });
    db.activities[a.id] = a;
    ensureStoryLog(db, a, '_p~iF~ps|U_ulLnnqC_mqNvxq`@', NOW);
    const log = Object.values(db.workoutLogs)[0];
    expect(log.trail).toBeUndefined();
    a.sport = 'trail';
    expect(alignStoryLog(db, a)).toBe(true);
    expect(log.trail).toBe(true);
    expect(alignStoryLog(db, a)).toBe(false); // idempotente
    a.sport = 'running';
    expect(alignStoryLog(db, a)).toBe(true);
    expect('trail' in log).toBe(false);
  });

  it('file: il trail si riconosce solo se il file lo dice; l\'escursionismo resta camminata', () => {
    expect(sportFromText('trail_running')).toBe('trail');
    expect(sportFromText('TrailRun')).toBe('trail');
    expect(sportFromText('Hiking')).toBe('walking');
    expect(sportFromText('trail walk')).toBe('walking');
    expect(sportFromText('Running')).toBe('running');
    const gpx = `<gpx><trk><name>Monte Falco</name><type>trail_running</type><trkseg><trkpt lat="44.0" lon="11.0"><time>2026-10-20T07:00:00Z</time></trkpt><trkpt lat="44.01" lon="11.0"><time>2026-10-20T07:10:00Z</time></trkpt></trkseg></trk></gpx>`;
    expect(parseGpx(gpx).activities[0].sport).toBe('trail');
  });
});

/* ---------------------------------------------------------------------- */
let n = 0;
const wlog = (day: string, km: number | null, sec: number, extra: Partial<WorkoutLog> = {}) =>
  ({ id: `t${++n}`, userId: 'u', plannedSessionId: null, kind: 'run_free', title: `Uscita ${day}`, startedAt: `2026-03-${day}T08:00:00Z`, durationSec: sec, distanceKm: km, paceSecPerKm: null, rpe: null, difficulties: '', notes: '', sets: [], mode: 'manual', activityId: null, shared: false, sport: 'running', environment: 'outdoor', createdAt: `2026-03-${day}T09:00:00Z`, updatedAt: '', ...extra }) as WorkoutLog;
const codes = (a: { code: string }[]) => a.map((x) => x.code);

describe('record: trail, corsa + camminata', () => {
  it('il trail ha record propri di distanza e durata, mai di passo o di tempo sui km da strada', () => {
    const t1 = wlog('01', 10, 4200, { trail: true });
    const t2 = wlog('08', 21.05, 9000, { trail: true }); // più lungo e anche "più veloce" sulla mezza: niente tot_21
    const all = [t1, t2];
    expect(codes(activityAwards(t1.id, all))).toEqual(['first_trail']);
    const got = codes(activityAwards(t2.id, all));
    expect(got).toEqual(expect.arrayContaining(['trail_longest_dist', 'trail_longest_time']));
    expect(got.some((c) => /^(seg_|tot_|run_)/.test(c))).toBe(false);
    const rec = currentRecords(all);
    expect(rec.every((r) => r.sport === 'trail')).toBe(true);
    expect(codes(rec).sort()).toEqual(['trail_longest_dist', 'trail_longest_time']);
  });

  it('un trail non batte i record della corsa e la corsa non batte quelli del trail', () => {
    const road = wlog('01', 5, 1500);
    const trail = wlog('02', 30, 14400, { trail: true });
    const road2 = wlog('03', 8, 2600);
    const all = [road, trail, road2];
    expect(codes(activityAwards(trail.id, all))).toEqual(['first_trail']);
    // la corsa più lunga è la #3 (8 km): il trail da 30 km non conta come corsa
    expect(codes(activityAwards(road2.id, all))).toContain('run_longest_dist');
    expect(currentRecords(all).find((r) => r.code === 'run_longest_dist')?.logId).toBe(road2.id);
    expect(nextTargets(all).map((x) => x.label)).toEqual(['Corse', 'Uscite trail']);
  });

  it('corsa + camminata conta tra le corse ma non entra nei tempi della corsa', () => {
    const old = wlog('01', 5, 1800);
    const rw = wlog('02', 5.1, 1500, { kind: 'run_walk' }); // passo più veloce sui 5 km: non è un record di tempo
    const rwLong = wlog('03', 9, 3600, { kind: 'run_walk' });
    const all = [old, rw, rwLong];
    expect(groupOf(rw)).toBe('running');
    expect(codes(activityAwards(rw.id, all))).not.toContain('tot_5');
    expect(codes(activityAwards(rwLong.id, all))).toContain('run_longest_dist');
    expect(codes(allAwards(all)).filter((c) => /^(seg_|tot_)/.test(c))).toEqual([]);
  });

  it('"Altro" non produce record di prestazione e non entra in distanza più lunga e ritmo migliore', () => {
    const db = emptyDb();
    db.users.u = { id: 'u', username: 'u', avatar: null, profileCompleted: true, displayName: 'U', bio: '', hue: 1, sports: ['running'], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
    const add = (sport: 'running' | 'trail' | 'other' | 'run_walk', km: number, min: number, day: string) => {
      const a = newActivity(NOW, { userId: 'u', source: 'manual', sport, date: `2026-10-${day}T07:00:00.000Z`, distanceKm: km, durationMin: min });
      db.activities[a.id] = a;
    };
    add('running', 6, 36, '10'); // 6:00/km
    add('other', 60, 120, '11'); // 2:00/km: sarebbe il "ritmo migliore" e la "distanza più lunga"
    add('trail', 18, 150, '12'); // distanza vera, passo non confrontabile
    add('run_walk', 5, 25, '13'); // 5:00/km medio: non è un ritmo di corsa
    const s = getStats({ db, now: NOW, actorId: 'u' }, 'Europe/Rome');
    expect(s.records.longestKm?.value).toBe(18);
    expect(s.records.fastestPace?.secPerKm).toBe(360);
  });
});

/* ---------------------------------------------------------------------- */
const est = (sport: EventSport, km: number | null, paceSec: number | null) => estimateLevel({ sport, km, paceSec });

describe('stima del livello: nuovi tipi', () => {
  it('eventSportOf: i tipi noti restano, gli sport futuri valgono "altro"; la creazione offre i 5 tipi', async () => {
    expect((['running', 'walking', 'trail', 'run_walk', 'other'] as const).map(eventSportOf)).toEqual(['running', 'walking', 'trail', 'run_walk', 'other']);
    expect(eventSportOf('cycling')).toBe('other');
    expect((await eventStyle()).EVENT_SPORTS).toEqual(ENABLED_SPORTS.map((s) => s.id));
  });

  it('trail: il passo da solo non lo giudica (un passo lento non lo rende facile)', () => {
    expect(est('trail', null, null)).toEqual({ level: 2, basis: 'default' });
    expect(est('trail', null, 720)).toEqual({ level: 2, basis: 'default' }); // 12:00/km in salita non è "principiante"
    expect(est('trail', 25, 720)).toEqual({ level: 4, basis: 'distance' });
    expect(est('trail', 10, null)).toEqual({ level: 2, basis: 'distance' });
    expect(est('trail', 5, 600).level).toBe(1);
    // il passo può solo alzare il livello
    expect(est('trail', 5, 330)).toEqual({ level: 4, basis: 'pace' });
    // a parità di distanza un trail non è mai stimato più facile della corsa su strada senza ritmo
    for (const km of [3, 5, 8, 10, 12, 15, 20, 25, 30]) expect(est('trail', km, null).level).toBeGreaterThanOrEqual(est('running', km, null).level);
  });

  it('trail e corsa + camminata: più distanza o più velocità non abbassano mai il livello', () => {
    for (const sport of ['trail', 'run_walk'] as const) {
      for (const km of [null, 1, 3, 5, 8, 10, 12, 15, 21, 30, 42]) {
        let prev = -1;
        for (let pace = 900; pace >= 120; pace -= 5) {
          const { level } = est(sport, km, pace);
          expect(level).toBeGreaterThanOrEqual(prev);
          prev = level;
        }
      }
      for (const pace of [null, 300, 420, 540, 660, 780]) {
        let prev = -1;
        for (let km = 0.5; km <= 60; km += 0.5) {
          const { level } = est(sport, km, pace);
          expect(level).toBeGreaterThanOrEqual(prev);
          prev = level;
        }
      }
    }
  });

  it('corsa + camminata: fasce proprie, tra camminata e corsa', () => {
    expect(est('run_walk', null, null)).toEqual({ level: 1, basis: 'default' });
    expect(est('run_walk', null, 720)).toEqual({ level: 0, basis: 'pace' }); // 12:00 medio
    expect(est('run_walk', null, 600).level).toBe(1); // 10:00
    expect(est('run_walk', null, 480).level).toBe(2); // 8:00
    expect(est('run_walk', 3, null)).toEqual({ level: 0, basis: 'distance' });
    expect(est('run_walk', 21, 600).level).toBe(3); // lungo: almeno Sostenuto
    for (let pace = 300; pace <= 900; pace += 15) expect(est('run_walk', null, pace).level).toBeGreaterThanOrEqual(est('running', null, pace).level);
  });

  it('altro: nessuna stima da distanza o ritmo, sempre "Intermedio" da scegliere a mano', () => {
    expect(est('other', null, null)).toEqual({ level: 2, basis: 'default' });
    expect(est('other', 60, 200)).toEqual({ level: 2, basis: 'default' });
    expect(est('other', 2, 900)).toEqual({ level: 2, basis: 'default' });
    expect(hasPaceScale('other')).toBe(false);
    expect(hasPaceScale('trail')).toBe(true);
  });

  it('scale dei nuovi tipi dentro i limiti del server', () => {
    for (const sport of ['trail', 'run_walk', 'other'] as const) {
      const ticks = DISTANCE_TICKS[sport];
      expect([...ticks].sort((a, b) => a - b)).toEqual([...ticks]);
      expect(ticks[0]).toBeGreaterThanOrEqual(DISTANCE_LIMITS.min);
      expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(DISTANCE_LIMITS.max);
      const p = PACE_SCALE[sport];
      expect(p.slow).toBeGreaterThan(p.fast);
      expect(p.fast).toBeGreaterThanOrEqual(PACE_LIMITS.min);
      expect(p.slow).toBeLessThanOrEqual(PACE_LIMITS.max);
      expect(p.labels[0]).toBe(p.slow);
    }
  });
});

/* ---------------------------------------------------------------------- */
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

describe('colori e figure dei nuovi tipi', () => {
  it('trail e altro hanno un colore proprio, leggibile sugli sfondi scuri', () => {
    for (const s of [ACTIVITY_STYLES.trail, ACTIVITY_STYLES.other]) for (const bg of ['#0E1216', '#191F25', '#222A32']) expect(contrast(s.solid, bg)).toBeGreaterThanOrEqual(4.5);
    const others = Object.entries(ACTIVITY_STYLES).filter(([k, s]) => k !== 'trail' && !s.blend).map(([, s]) => s.solid);
    expect(others).not.toContain(ACTIVITY_STYLES.trail.solid);
    expect(ACTIVITY_STYLES.other.solid).not.toBe(ACTIVITY_STYLES.rest.solid);
  });

  it('ogni tipo di uscita ha il suo stile; corsa + camminata è la fusione dei due colori ufficiali con le due figure', () => {
    expect(styleOfSport('trail')).toBe(ACTIVITY_STYLES.trail);
    expect(styleOfSport('other')).toBe(ACTIVITY_STYLES.other);
    expect(styleOfSport('cycling')).toBe(ACTIVITY_STYLES.other);
    const rw = styleOfSport('run_walk');
    expect(rw.glyph).toBe('run_walk');
    expect(gradientFor([rw])).toEqual([ACTIVITY_STYLES.run.solid, ACTIVITY_STYLES.walk.solid]);
    expect(ACTIVITY_STYLES.trail.glyph).toBe('trail');
    expect(ACTIVITY_STYLES.other.glyph).toBeUndefined(); // icona generica
  });
});
