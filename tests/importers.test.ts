import { describe, expect, it } from 'vitest';
import { call } from '../shared/api.ts';
import { newActivity } from '../shared/activities.ts';
import { AppError, DEFAULT_PRIVACY, emptyDb, type Ctx } from '../shared/engine.ts';
import { detectFormat, parseAppleHealthWorkouts, parseGpx, parseTcx, parseWorkoutFile } from '../shared/importers.ts';
import type { ImportItem, ImportResult } from '../shared/importing.ts';
import { cleanFileSamples, fileMeasurements } from '../shared/fileMeasurements.ts';

const GPX = `<?xml version="1.0"?><gpx version="1.1"><trk><name>Giro &amp; ritorno</name><type>running</type><trkseg>
<trkpt lat="44.2200" lon="12.0400"><time>2026-10-20T06:00:00Z</time></trkpt>
<trkpt lat="44.2300" lon="12.0400"><time>2026-10-20T06:05:00Z</time></trkpt>
<trkpt lat="44.2400" lon="12.0400"><time>2026-10-20T06:10:00Z</time></trkpt></trkseg></trk>
<trk><name>Senza orari</name><trkseg><trkpt lat="1" lon="1"></trkpt><trkpt lat="1.1" lon="1"></trkpt></trkseg></trk></gpx>`;

const TCX = `<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-10-21T07:00:00Z</Id>
<Lap StartTime="2026-10-21T07:00:00Z"><TotalTimeSeconds>1500</TotalTimeSeconds><DistanceMeters>5000</DistanceMeters></Lap>
<Lap StartTime="2026-10-21T07:25:00Z"><TotalTimeSeconds>600</TotalTimeSeconds><DistanceMeters>2000</DistanceMeters></Lap></Activity>
<Activity Sport="Biking"><Id>2026-10-22T07:00:00Z</Id><Lap><TotalTimeSeconds>1</TotalTimeSeconds><DistanceMeters>1</DistanceMeters></Lap></Activity></Activities></TrainingCenterDatabase>`;

const HEALTH = `<?xml version="1.0"?><HealthData locale="it_IT"><Record type="HKQuantityTypeIdentifierHeartRate" value="140"/>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="32.5" durationUnit="min" totalDistance="5.2" totalDistanceUnit="km" startDate="2026-10-22 07:30:00 +0200" endDate="2026-10-22 08:02:30 +0200"><MetadataEntry key="x" value="y"/></Workout>
<Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="1800" durationUnit="s" totalDistance="1.5" totalDistanceUnit="mi" startDate="2026-10-23 18:00:00 +0200"/>
<Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="30" durationUnit="min" startDate="2026-10-23 10:00:00 +0200"/></HealthData>`;

describe('parser file di allenamento', () => {
  it('legge le estensioni GPX e non trasforma valori mancanti in zeri', () => {
    const xml = GPX.replace('<time>2026-10-20T06:00:00Z</time>', '<time>2026-10-20T06:00:00Z</time><ele>0</ele><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr><gpxtpx:cad>80</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>').replace('<time>2026-10-20T06:05:00Z</time>', '<time>2026-10-20T06:05:00Z</time><ele>12</ele>');
    const samples = parseGpx(xml).activities[0].samples!;
    expect(samples[0]).toMatchObject({ hr: 140, cadence: 80, alt: 0, distanceKm: 0 });
    expect(samples[1].hr).toBeUndefined(); expect(samples[2].alt).toBeUndefined();
    expect(fileMeasurements(samples)).toMatchObject({ hrAvg: 140, hrMax: 140, cadAvg: 80, gain: 12, loss: 0 });
  });
  it('legge cuore, quota e RunCadence dei Trackpoint TCX con namespace', () => {
    const xml = TCX.replace('</Lap>', '<Track><Trackpoint><DistanceMeters>100</DistanceMeters><HeartRateBpm><Value>150</Value></HeartRateBpm><AltitudeMeters>-5</AltitudeMeters><Extensions><ns3:TPX><ns3:RunCadence>85</ns3:RunCadence></ns3:TPX></Extensions></Trackpoint><Trackpoint><DistanceMeters>200</DistanceMeters><AltitudeMeters>10</AltitudeMeters></Trackpoint></Track></Lap>');
    const samples = parseTcx(xml).activities[0].samples!;
    expect(samples).toEqual([{ distanceKm: 0.1, hr: 150, alt: -5, cadence: 85 }, { distanceKm: 0.2, alt: 10 }]);
    expect(fileMeasurements(samples).gain).toBe(15);
    expect(fileMeasurements(cleanFileSamples([{ hr: -1, cadence: Infinity, alt: '12' }, {}]))).toMatchObject({ hrAvg: null, cadAvg: null, gain: null });
  });
  it('riconosce il formato', () => {
    expect(detectFormat(GPX)).toBe('gpx');
    expect(detectFormat(TCX)).toBe('tcx');
    expect(detectFormat(HEALTH)).toBe('apple-health');
    expect(detectFormat('<html></html>')).toBeNull();
    expect(() => parseWorkoutFile('ciao')).toThrow(/Formato non riconosciuto/);
  });
  it('GPX: distanza calcolata dai punti, orari dal file, tracce senza orari scartate', () => {
    const r = parseGpx(GPX);
    expect(r.skipped).toBe(1);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0]).toMatchObject({ title: 'Giro & ritorno', date: '2026-10-20T06:00:00.000Z', durationMin: 10, sport: 'running' });
    expect(r.activities[0].distanceKm).toBeCloseTo(2.22, 1);
  });
  it('TCX: somma dei giri, sport non supportati ignorati', () => {
    const r = parseTcx(TCX);
    expect(r.activities).toEqual([expect.objectContaining({ distanceKm: 7, durationMin: 35, date: '2026-10-21T07:00:00.000Z' })]);
    expect(r.skipped).toBe(1);
  });
  it('Apple Salute: solo gli allenamenti di corsa/camminata, con conversione di unità e fusi', () => {
    const r = parseAppleHealthWorkouts(HEALTH);
    expect(r.activities).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.activities[0]).toMatchObject({ sport: 'running', date: '2026-10-22T05:30:00.000Z', distanceKm: 5.2, durationMin: 33 });
    expect(r.activities[1]).toMatchObject({ sport: 'walking', distanceKm: 2.41, durationMin: 30 });
    expect(JSON.stringify(r)).not.toMatch(/HeartRate|140/); // nessun altro dato sanitario viene letto
  });
});

describe('importazione nello storico', () => {
  const NOW = new Date('2026-10-24T10:00:00Z');
  const mk = () => {
    const db = emptyDb();
    db.users.a = { id: 'a', username: 'a', avatar: null, profileCompleted: true, displayName: 'A', bio: '', hue: 1, sports: [], area: '', privacy: { ...DEFAULT_PRIVACY }, createdAt: NOW.toISOString() };
    db.users.b = { ...db.users.a, id: 'b', username: 'b' };
    const as = (id: string | null): Ctx => ({ db, now: NOW, actorId: id });
    return { db, as };
  };
  const items = (): ImportItem[] => parseAppleHealthWorkouts(HEALTH).activities.map((a) => ({ ...a }));
  it('salva un log privato con campioni, lo deduplica e cancella anche le misure', () => {
    const { db, as } = mk();
    const parsed = parseGpx(GPX).activities;
    parsed[0].samples = [{ hr: 140, alt: 5, cadence: 82, distanceKm: 0 }, { alt: 15, distanceKm: 1 }];
    call(as('a'), 'importActivities', [parsed]);
    const log = Object.values(db.workoutLogs)[0];
    expect(log.origin).toBe('file'); expect(log.shared).toBe(false); expect(log.fileSamples).toEqual(parsed[0].samples);
    expect(() => call(as('b'), 'getWorkoutLog', [log.id])).toThrow(/non trovato/);
    call(as('a'), 'importActivities', [parsed]); expect(Object.values(db.workoutLogs)).toHaveLength(1);
    call(as('a'), 'deleteImported', ['file']); expect(Object.values(db.workoutLogs)).toHaveLength(0);
  });

  it('importa come attività private, senza duplicati alla seconda importazione', () => {
    const { db, as } = mk();
    expect(call(as('a'), 'importActivities', [items()]) as ImportResult).toEqual({ imported: 2, duplicates: 0, invalid: 0 });
    expect(call(as('a'), 'importActivities', [items()]) as ImportResult).toEqual({ imported: 0, duplicates: 2, invalid: 0 });
    const list = Object.values(db.activities);
    expect(list).toHaveLength(2);
    expect(list.every((a) => a.visibility === 'private' && a.source === 'file' && a.importedAt)).toBe(true);
  });

  it('deduplica rispetto a un\'attività già presente da un\'altra fonte', () => {
    const { db, as } = mk();
    const s = newActivity(NOW, { userId: 'a', source: 'strava', sport: 'running', date: '2026-10-22T05:31:00.000Z', distanceKm: 5.21, durationMin: 33, visibility: 'private', externalId: 'strava:1', dayOnly: false });
    db.activities[s.id] = s;
    expect(call(as('a'), 'importActivities', [items()]) as ImportResult).toEqual({ imported: 1, duplicates: 1, invalid: 0 });
  });

  it('scarta voci non valide e limita il numero', () => {
    const { as } = mk();
    const bad: ImportItem[] = [{ externalId: 'x', sport: 'running', title: '', date: '2099-01-01T00:00:00Z', distanceKm: 5, durationMin: 30 }, { externalId: 'y', sport: 'running', title: '', date: '2026-10-01T00:00:00Z', distanceKm: -5, durationMin: 30 }, { externalId: 'z', sport: 'running', title: '', date: '2026-10-01T00:00:00Z', distanceKm: null, durationMin: null }];
    expect(call(as('a'), 'importActivities', [bad]) as ImportResult).toEqual({ imported: 0, duplicates: 0, invalid: 3 });
    expect(() => call(as('a'), 'importActivities', [Array(501).fill(bad[0])])).toThrow(AppError);
    expect(() => call(as(null), 'importActivities', [items()])).toThrow(/Accedi/);
  });

  it('l\'utente può rendere condivisibile un import da file, ritirarlo o cancellarlo; Strava resta privato', () => {
    const { db, as } = mk();
    call(as('a'), 'importActivities', [items()]);
    const id = Object.keys(db.activities)[0];
    expect(() => call(as('b'), 'setActivityVisibility', [id, 'shared'])).toThrow(/non trovata/);
    call(as('a'), 'setActivityVisibility', [id, 'shared']);
    expect(db.activities[id].visibility).toBe('shared');
    const st = newActivity(NOW, { userId: 'a', source: 'strava', sport: 'running', date: '2026-10-10T05:31:00.000Z', distanceKm: 9, durationMin: 50, visibility: 'private', externalId: 'strava:2', dayOnly: false });
    db.activities[st.id] = st;
    expect(() => call(as('a'), 'setActivityVisibility', [st.id, 'shared'])).toThrow(/Strava/);
    expect(call(as('a'), 'deleteImported', ['file'])).toEqual({ deleted: 2 });
    expect(Object.values(db.activities).map((a) => a.source)).toEqual(['strava']);
  });
});
