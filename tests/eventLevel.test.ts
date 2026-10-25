import { describe, expect, it } from 'vitest';
import { LEVELS as SAVED_LEVELS, levelLabel as savedLevelLabel } from '../shared/sports.ts';
import {
  DISTANCE_LIMITS,
  DISTANCE_TICKS,
  PACE_LIMITS,
  PACE_SCALE,
  UI_LEVELS,
  clampLevel,
  estimateLevel,
  fracToKm,
  fracToPace,
  fromServerLevel,
  kmToFrac,
  levelLabel,
  nearestIndex,
  paceInScale,
  paceMid,
  paceToFrac,
  parseKm,
  snapKm,
  stepKm,
  stepPace,
  toServerLevel,
  type UiLevel,
} from '../shared/eventLevel.ts';

const run = (km: number | null, paceSec: number | null) => estimateLevel({ sport: 'running', km, paceSec });
const walk = (km: number | null, paceSec: number | null) => estimateLevel({ sport: 'walking', km, paceSec });

describe('livelli dell’app', () => {
  it('anche il catalogo usato dal web espone cinque etichette italiane', () => {
    expect(SAVED_LEVELS.map((l) => l.id)).toEqual(['beginner', 'easy', 'medium', 'hard', 'advanced']);
    expect(savedLevelLabel('advanced')).toBe('Avanzato');
    expect(savedLevelLabel('beginner')).toBe('Principiante');
  });
  it('sono cinque, in ordine, con etichetta e descrizione brevi', () => {
    expect(UI_LEVELS.map((l) => l.label)).toEqual(['Principiante', 'Tranquillo', 'Intermedio', 'Sostenuto', 'Avanzato']);
    UI_LEVELS.forEach((l, i) => {
      expect(l.id).toBe(i);
      expect(l.hint.length).toBeGreaterThan(5);
      expect(l.hint.length).toBeLessThanOrEqual(40);
    });
  });
  it('clampLevel resta tra 0 e 4 anche con valori strani', () => {
    expect(clampLevel(-3)).toBe(0);
    expect(clampLevel(9)).toBe(4);
    expect(clampLevel(2.4)).toBe(2);
    expect(clampLevel(Number.NaN)).toBe(0);
    expect(levelLabel(3)).toBe('Sostenuto');
  });
});

describe('stima del livello: corsa', () => {
  it('dal ritmo, con fasce sensate', () => {
    expect(run(null, 420)).toEqual({ level: 1, basis: 'pace' }); // 7:00
    expect(run(null, 480)).toEqual({ level: 0, basis: 'pace' }); // 8:00
    expect(run(null, 360).level).toBe(2); // 6:00
    expect(run(null, 300).level).toBe(3); // 5:00
    expect(run(null, 270).level).toBe(4); // 4:30
  });
  it('al confine esatto vale il livello più impegnativo (prudenza)', () => {
    expect(run(null, 390).level).toBe(2); // 6:30 → Intermedio
    expect(run(null, 395).level).toBe(1); // 6:35 → Tranquillo
    expect(run(null, 450).level).toBe(1); // 7:30 → Tranquillo
    expect(run(null, 455).level).toBe(0);
    expect(run(null, 285).level).toBe(4); // 4:45
  });
  it('una distanza lunga alza il livello anche a ritmo tranquillo', () => {
    expect(run(10, 390).level).toBe(2);
    expect(run(15, 390).level).toBe(3); // +1
    expect(run(21, 360).level).toBe(3);
    expect(run(42, 330).level).toBe(4); // Sostenuto + 2, limitato ad Avanzato
    expect(run(30, 480).level).toBe(3); // lento ma 30 km: almeno Sostenuto
    expect(run(12, 500).level).toBe(1); // 12 km non è da principianti
    expect(run(5, 480).level).toBe(0); // 5 km lenti restano per chi inizia
  });
  it('una distanza breve non abbassa un ritmo veloce', () => {
    expect(run(3, 270).level).toBe(4);
  });
  it('senza ritmo usa la distanza, mai "Principiante"', () => {
    expect(run(3, null)).toEqual({ level: 1, basis: 'distance' });
    expect(run(5, null).level).toBe(1);
    expect(run(10, null).level).toBe(2);
    expect(run(21, null).level).toBe(3);
    expect(run(30, null).level).toBe(4);
  });
  it('senza nulla un default prudente', () => {
    expect(run(null, null)).toEqual({ level: 2, basis: 'default' });
  });
  it('ignora valori non validi', () => {
    expect(run(0, 0)).toEqual({ level: 2, basis: 'default' });
    expect(run(-5, Number.NaN)).toEqual({ level: 2, basis: 'default' });
    expect(run(Number.POSITIVE_INFINITY, null).basis).toBe('default');
  });
});

describe('stima del livello: camminata', () => {
  it('fasce di passo diverse dalla corsa', () => {
    expect(walk(null, 780)).toEqual({ level: 0, basis: 'pace' }); // 13:00
    expect(walk(null, 720).level).toBe(1); // 12:00, 5 km/h
    expect(walk(null, 600).level).toBe(2); // 10:00, 6 km/h
    expect(walk(null, 510).level).toBe(3); // 8:30
    expect(walk(null, 450).level).toBe(4); // 7:30, 8 km/h
    // lo stesso passo vale molto diverso tra corsa e camminata
    expect(walk(null, 480).level).toBeGreaterThan(run(null, 480).level);
  });
  it('distanze lunghe e sola distanza', () => {
    expect(walk(6, 720).level).toBe(1);
    expect(walk(15, 600).level).toBe(3);
    expect(walk(25, 780).level).toBe(3);
    expect(walk(2, null)).toEqual({ level: 0, basis: 'distance' });
    expect(walk(6, null).level).toBe(1);
    expect(walk(10, null).level).toBe(2);
    expect(walk(20, null).level).toBe(3);
    expect(walk(30, null).level).toBe(4);
  });
  it('default prudente diverso dalla corsa', () => {
    expect(walk(null, null)).toEqual({ level: 1, basis: 'default' });
  });
});

describe('stima del livello: coerenza', () => {
  const kms = [null, 1, 3, 5, 8, 10, 12, 15, 18, 21, 25, 30, 42];
  it('un ritmo più veloce non abbassa mai il livello (a parità di distanza)', () => {
    for (const sport of ['running', 'walking'] as const)
      for (const km of kms) {
        let prev = -1;
        for (let pace = 900; pace >= 120; pace -= 5) {
          const { level, basis } = estimateLevel({ sport, km, paceSec: pace });
          expect(basis).toBe('pace');
          expect(level).toBeGreaterThanOrEqual(prev);
          prev = level;
        }
      }
  });
  it('una distanza più lunga non abbassa mai il livello (a parità di ritmo, o senza ritmo)', () => {
    for (const sport of ['running', 'walking'] as const)
      for (const pace of [null, 240, 300, 360, 420, 480, 600, 720, 840]) {
        let prev = -1;
        for (let km = 0.5; km <= 60; km += 0.5) {
          const { level } = estimateLevel({ sport, km, paceSec: pace });
          expect(level).toBeGreaterThanOrEqual(prev);
          prev = level;
        }
      }
  });
  it('a parità di ritmo, la camminata non è mai stimata più facile della corsa', () => {
    for (let pace = 120; pace <= 900; pace += 15) expect(walk(null, pace).level).toBeGreaterThanOrEqual(run(null, pace).level);
  });
});

describe('conversione con il server', () => {
  it('toServerLevel: cinque livelli senza perdita', () => {
    expect(([0, 1, 2, 3, 4] as UiLevel[]).map(toServerLevel)).toEqual(['beginner', 'easy', 'medium', 'hard', 'advanced']);
  });
  it('fromServerLevel: livello centrale della fascia, o la stima se è nella stessa fascia', () => {
    expect(fromServerLevel('easy')).toBe(1);
    expect(fromServerLevel('medium')).toBe(2);
    expect(fromServerLevel('hard')).toBe(3);
    expect(fromServerLevel('hard', 4)).toBe(3);
    expect(fromServerLevel('easy', 0)).toBe(1);
    expect(fromServerLevel('easy', 3)).toBe(1); // la stima non sovrascrive il dato salvato
    expect(fromServerLevel('medium', null)).toBe(2);
  });
  it('andata e ritorno non cambia mai il dato salvato', () => {
    for (const l of ['beginner', 'easy', 'medium', 'hard', 'advanced'] as const) for (const near of [0, 1, 2, 3, 4] as UiLevel[]) expect(toServerLevel(fromServerLevel(l, near))).toBe(l);
  });
});

describe('scala della distanza', () => {
  const ticks = DISTANCE_TICKS.running;
  it('tacche comuni equispaziate', () => {
    expect(DISTANCE_TICKS.running).toEqual([1, 3, 5, 8, 10, 15, 21, 30, 42]);
    expect(DISTANCE_TICKS.walking).toEqual([1, 2, 4, 6, 8, 10, 15, 20]);
    ticks.forEach((t, i) => expect(kmToFrac(ticks, t)).toBeCloseTo(i / (ticks.length - 1), 9));
  });
  it('posizione e distanza sono una l’inversa dell’altra', () => {
    for (const km of [1, 2, 4.5, 7, 12.5, 21, 25, 42]) expect(fracToKm(ticks, kmToFrac(ticks, km))).toBeCloseTo(km, 9);
    expect(kmToFrac(ticks, 0.5)).toBe(0);
    expect(kmToFrac(ticks, 80)).toBe(1);
    expect(fracToKm(ticks, -1)).toBe(1);
    expect(fracToKm(ticks, 2)).toBe(42);
  });
  it('aggancio a mezzo chilometro, nei limiti', () => {
    expect(snapKm(7.26)).toBe(7.5);
    expect(snapKm(7.24)).toBe(7);
    expect(snapKm(0.1)).toBe(DISTANCE_LIMITS.min);
    expect(snapKm(999)).toBe(DISTANCE_LIMITS.max);
  });
  it('pulsanti − e +', () => {
    expect(stepKm(null, 1, ticks)).toBe(1);
    expect(stepKm(null, -1, ticks)).toBeNull();
    expect(stepKm(7, 1, ticks)).toBe(7.5);
    expect(stepKm(7.5, -1, ticks)).toBe(7);
    expect(stepKm(7.33, 1, ticks)).toBe(7.5);
    expect(stepKm(7.33, -1, ticks)).toBe(7);
    expect(stepKm(0.5, -1, ticks)).toBe(0.5);
    expect(stepKm(300, 1, ticks)).toBe(300);
  });
  it('distanza scritta a mano', () => {
    expect(parseKm('7,5')).toBe(7.5);
    expect(parseKm(' 21.1 ')).toBe(21.1);
    expect(parseKm('42,195')).toBeCloseTo(42.2, 2);
    expect(parseKm('0,2')).toBeNull();
    expect(parseKm('301')).toBeNull();
    expect(parseKm('abc')).toBeNull();
    expect(parseKm('')).toBeNull();
    expect(parseKm('5,5,5')).toBeNull();
  });
  it('tacca più vicina entro la tolleranza', () => {
    const fr = [0, 0.25, 0.5, 0.75, 1];
    expect(nearestIndex(fr, 0.27, 0.03)).toBe(1);
    expect(nearestIndex(fr, 0.4, 0.03)).toBe(-1);
    expect(nearestIndex(fr, 1, 0)).toBe(4);
  });
});

describe('scala del ritmo', () => {
  it('corsa 3:30 - 9:00 e camminata 7:00 - 15:00, lento a sinistra', () => {
    expect(PACE_SCALE.running.slow).toBe(540);
    expect(PACE_SCALE.running.fast).toBe(210);
    expect(PACE_SCALE.walking.slow).toBe(900);
    expect(PACE_SCALE.walking.fast).toBe(420);
    expect(paceToFrac('running', 540)).toBe(0);
    expect(paceToFrac('running', 210)).toBe(1);
    expect(paceToFrac('running', 120)).toBe(1);
    expect(paceToFrac('walking', 1000)).toBe(0);
  });
  it('aggancio a 5 secondi dentro la scala', () => {
    for (const sport of ['running', 'walking'] as const)
      for (let f = 0; f <= 1; f += 0.037) {
        const p = fracToPace(sport, f);
        expect(p % 5).toBe(0);
        expect(p).toBeGreaterThanOrEqual(PACE_SCALE[sport].fast);
        expect(p).toBeLessThanOrEqual(PACE_SCALE[sport].slow);
      }
    expect(fracToPace('running', paceToFrac('running', 390))).toBe(390);
    expect(paceMid('running')).toBe(375);
    expect(paceMid('walking')).toBe(660);
  });
  it('un passo resta sensato solo dentro la scala del tipo (cambio tra corsa e camminata)', () => {
    expect(paceInScale('running', 360)).toBe(true);
    expect(paceInScale('walking', 360)).toBe(false); // 6:00 al km non è una camminata
    expect(paceInScale('walking', 600)).toBe(true);
    expect(paceInScale('running', 600)).toBe(false);
    expect(paceInScale('running', 210)).toBe(true);
    expect(paceInScale('walking', 900)).toBe(true);
    expect(paceInScale('running', null)).toBe(false);
    expect(paceInScale('walking', Number.NaN)).toBe(false);
  });
  it('pulsanti: più veloce toglie 5 s, più lento li aggiunge, nei limiti del server', () => {
    expect(stepPace(390, 1, 'running')).toBe(385);
    expect(stepPace(390, -1, 'running')).toBe(395);
    expect(stepPace(392, 1, 'running')).toBe(390);
    expect(stepPace(392, -1, 'running')).toBe(395);
    expect(stepPace(null, 1, 'running')).toBe(370);
    expect(stepPace(null, -1, 'walking')).toBe(665);
    expect(stepPace(PACE_LIMITS.min, 1, 'running')).toBe(PACE_LIMITS.min);
    expect(stepPace(PACE_LIMITS.max, -1, 'walking')).toBe(PACE_LIMITS.max);
  });
});
