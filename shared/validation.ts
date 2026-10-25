import { PACT_CONFLICT, pactHasConflict, pactModes } from './pact.ts';
import { SPORTS } from './sports.ts';
import { isValidTimezone } from './time.ts';
import type { ActivityInput, AvatarFrame, ClubInput, EventInput, Level, ProfileAccent, ProfileInput, ProfileStyle, RunPact, SportId, Visibility } from './types.ts';

export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const LEVELS: Level[] = ['easy', 'medium', 'hard'];
const VISIBILITIES: Visibility[] = ['public', 'club', 'private'];
const MAX_IMAGE_CHARS = 120_000;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL, '').trim().slice(0, max * 4);
}

function isSport(v: unknown): v is SportId {
  return typeof v === 'string' && SPORTS.some((s) => s.id === v);
}

function numOrNull(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined; // non valido
}

export const LIMITS = {
  titleMin: 3,
  titleMax: 80,
  placeMin: 3,
  placeMax: 120,
  areaMax: 60,
  notesMax: 600,
  distanceMin: 0.5,
  distanceMax: 300,
  paceMin: 120,
  paceMax: 900,
  participantsMin: 2,
  participantsMax: 200,
  maxDaysAhead: 400,
};

export function validateEventInput(raw: Partial<EventInput> | null | undefined, now: Date, opts: { allowPast?: boolean } = {}): Validated<EventInput> {
  const errors: FieldErrors = {};
  const r = raw ?? {};
  const title = clean(r.title, LIMITS.titleMax);
  if (title.length < LIMITS.titleMin) errors.title = `Scrivi un titolo di almeno ${LIMITS.titleMin} caratteri.`;
  else if (title.length > LIMITS.titleMax) errors.title = `Massimo ${LIMITS.titleMax} caratteri.`;

  if (!isSport(r.sport) || !SPORTS.find((s) => s.id === r.sport)?.enabled) errors.sport = 'Scegli uno sport disponibile.';

  const timezone = typeof r.timezone === 'string' ? r.timezone : '';
  if (!isValidTimezone(timezone)) errors.timezone = 'Fuso orario non valido.';

  let startsAt = '';
  if (typeof r.startsAt !== 'string' || Number.isNaN(Date.parse(r.startsAt))) {
    errors.startsAt = 'Indica una data e un\'ora valide.';
  } else {
    startsAt = new Date(r.startsAt).toISOString();
    const t = Date.parse(startsAt);
    if (!opts.allowPast && t < now.getTime()) errors.startsAt = 'La data e l\'ora devono essere nel futuro.';
    else if (t > now.getTime() + LIMITS.maxDaysAhead * 86_400_000) errors.startsAt = 'Scegli una data entro i prossimi 13 mesi.';
  }

  const meetingPlace = clean(r.meetingPlace, LIMITS.placeMax);
  if (meetingPlace.length < LIMITS.placeMin) errors.meetingPlace = 'Indica dove ci si trova (es. "Ingresso palestra, via Roma").';
  else if (meetingPlace.length > LIMITS.placeMax) errors.meetingPlace = `Massimo ${LIMITS.placeMax} caratteri.`;

  const area = clean(r.area, LIMITS.areaMax);
  if (area.length > LIMITS.areaMax) errors.area = `Massimo ${LIMITS.areaMax} caratteri.`;

  const distanceKm = numOrNull(r.distanceKm);
  if (distanceKm === undefined) errors.distanceKm = 'Inserisci un numero.';
  else if (distanceKm !== null && (distanceKm < LIMITS.distanceMin || distanceKm > LIMITS.distanceMax))
    errors.distanceKm = `La distanza deve essere tra ${LIMITS.distanceMin} e ${LIMITS.distanceMax} km.`;

  const pace = numOrNull(r.paceSecPerKm);
  if (pace === undefined) errors.paceSecPerKm = 'Inserisci un ritmo come 5:30.';
  else if (pace !== null && (pace < LIMITS.paceMin || pace > LIMITS.paceMax))
    errors.paceSecPerKm = 'Il ritmo deve essere tra 2:00 e 15:00 al km.';

  const level = r.level;
  if (!LEVELS.includes(level as Level)) errors.level = 'Scegli un livello.';

  const notes = clean(r.notes, LIMITS.notesMax);
  if (notes.length > LIMITS.notesMax) errors.notes = `Massimo ${LIMITS.notesMax} caratteri.`;

  const max = numOrNull(r.maxParticipants);
  if (max === undefined || (max !== null && !Number.isInteger(max))) errors.maxParticipants = 'Inserisci un numero intero.';
  else if (max !== null && (max < LIMITS.participantsMin || max > LIMITS.participantsMax))
    errors.maxParticipants = `Tra ${LIMITS.participantsMin} e ${LIMITS.participantsMax} partecipanti.`;

  const visibility = r.visibility;
  if (!VISIBILITIES.includes(visibility as Visibility)) errors.visibility = 'Scegli chi può vedere l\'uscita.';
  const clubId = typeof r.clubId === 'string' && r.clubId ? r.clubId : null;
  if (visibility === 'club' && !clubId) errors.clubId = 'Scegli il club per un\'uscita riservata al club.';

  let lat = numOrNull(r.lat);
  let lng = numOrNull(r.lng);
  if (lat === undefined || lng === undefined || (lat === null) !== (lng === null)) {
    errors.lat = 'Coordinate non valide.';
    lat = null;
    lng = null;
  } else if (lat !== null && lng !== null) {
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) errors.lat = 'Coordinate non valide.';
    // Precisione ridotta (~100 m): basta per ordinare per vicinanza.
    lat = Math.round(lat * 1000) / 1000;
    lng = Math.round(lng * 1000) / 1000;
  }

  const pact = normalizePact(r.pact);
  if (pact === undefined) errors.pact = PACT_CONFLICT;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      sport: r.sport as SportId,
      startsAt,
      timezone,
      meetingPlace,
      area,
      lat: lat ?? null,
      lng: lng ?? null,
      distanceKm: distanceKm ?? null,
      paceSecPerKm: pace ?? null,
      level: level as Level,
      notes,
      maxParticipants: max ?? null,
      visibility: visibility as Visibility,
      clubId: visibility === 'club' || clubId ? clubId : null,
      routeId: typeof r.routeId === 'string' && r.routeId ? r.routeId : null,
      pact: pact ?? null,
    },
  };
}

export { PACT_CONFLICT };

/**
 * Patto di corsa normalizzato: null se non dichiara nulla, undefined se la combinazione è incoerente
 * (self pace insieme a "nessuno resta indietro" o "ritmo inclusivo"). I campi nuovi assenti valgono false,
 * così i patti salvati prima restano validi.
 */
export function normalizePact(raw: unknown): RunPact | null | undefined {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<Record<keyof RunPact, unknown>>;
  const pact: RunPact = {
    noDrop: p.noDrop === true,
    inclusivePace: p.inclusivePace === true,
    regroupPoints: clean(p.regroupPoints, 160),
    takeTurns: p.takeTurns === true,
    pairs: p.pairs === true,
    selfPace: p.selfPace === true,
  };
  if (pactHasConflict(pact)) return undefined;
  return pactModes(pact).length ? pact : null;
}

export function validateClubInput(raw: Partial<ClubInput> | null | undefined): Validated<ClubInput> {
  const errors: FieldErrors = {};
  const r = raw ?? {};
  const name = clean(r.name, 50);
  if (name.length < 3) errors.name = 'Il nome deve avere almeno 3 caratteri.';
  else if (name.length > 50) errors.name = 'Massimo 50 caratteri.';
  const description = clean(r.description, 300);
  if (description.length > 300) errors.description = 'Massimo 300 caratteri.';
  if (!isSport(r.sport)) errors.sport = 'Scegli uno sport.';
  const area = clean(r.area, LIMITS.areaMax);
  if (area.length > LIMITS.areaMax) errors.area = `Massimo ${LIMITS.areaMax} caratteri.`;
  let imageDataUrl: string | null = null;
  if (r.imageDataUrl) {
    if (typeof r.imageDataUrl !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(r.imageDataUrl))
      errors.imageDataUrl = 'Immagine non valida.';
    else if (r.imageDataUrl.length > MAX_IMAGE_CHARS) errors.imageDataUrl = 'Immagine troppo pesante.';
    else imageDataUrl = r.imageDataUrl;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, description, sport: r.sport as SportId, area, imageDataUrl } };
}

export const HANDLE_RE = /^[a-z0-9_.]{3,20}$/;
const MAX_AVATAR_CHARS = 24_000;
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export function normalizeEmail(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

export function validateProfileInput(raw: Partial<ProfileInput> | null | undefined): Validated<ProfileInput> {
  const errors: FieldErrors = {};
  const r = raw ?? {};
  const username = typeof r.username === 'string' ? r.username.trim().toLowerCase() : '';
  if (!HANDLE_RE.test(username)) errors.username = 'Usa 3–20 caratteri: lettere minuscole, numeri, punto o trattino basso.';
  let avatar: string | null = null;
  if (r.avatar) {
    if (typeof r.avatar !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(r.avatar)) errors.avatar = 'Immagine non valida.';
    else if (r.avatar.length > MAX_AVATAR_CHARS) errors.avatar = 'Immagine troppo pesante.';
    else avatar = r.avatar;
  }
  const displayName = clean(r.displayName, 30);
  if (displayName.length < 2) errors.displayName = 'Il nome deve avere almeno 2 caratteri.';
  else if (displayName.length > 30) errors.displayName = 'Massimo 30 caratteri.';
  const bio = clean(r.bio, 160);
  if (bio.length > 160) errors.bio = 'Massimo 160 caratteri.';
  const area = clean(r.area, LIMITS.areaMax);
  const sports = Array.isArray(r.sports) ? r.sports.filter(isSport) : [];
  const p = r.privacy;
  const privacy = {
    showStats: p?.showStats === true,
    showClubs: p?.showClubs === true,
    showUpcoming: p?.showUpcoming === true,
    shareActivity: p?.shareActivity === true,
    showRecognitions: p?.showRecognitions !== false,
  };
  let style: ProfileStyle | undefined;
  if (r.style !== undefined && r.style !== null) {
    const st = r.style as Partial<ProfileStyle>;
    const accent = (ACCENTS as readonly string[]).includes(st.accent as string) ? (st.accent as ProfileAccent) : null;
    const frame = (FRAMES as readonly string[]).includes(st.frame as string) ? (st.frame as AvatarFrame) : null;
    const featured = Array.isArray(st.featuredBadges) ? [...new Set(st.featuredBadges.filter((b): b is string => typeof b === 'string' && /^[a-z0-9_]{2,40}$/.test(b)))] : null;
    if (!accent || !frame || !featured || featured.length > 3) errors.style = 'Personalizzazione non valida.';
    else style = { accent, frame, featuredBadges: featured };
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { displayName, username, avatar, bio, sports: [...new Set(sports)], area, privacy, ...(style ? { style } : {}) } };
}

export const ACCENTS = ['teal', 'violet', 'amber', 'rose', 'lime', 'sky'] as const;
export const FRAMES = ['none', 'ring', 'double'] as const;
export const DEFAULT_STYLE: ProfileStyle = { accent: 'teal', frame: 'none', featuredBadges: [] };

export function validateActivityInput(raw: Partial<ActivityInput> | null | undefined, now: Date): Validated<ActivityInput> {
  const errors: FieldErrors = {};
  const r = raw ?? {};
  let date = '';
  if (typeof r.date !== 'string' || Number.isNaN(Date.parse(r.date))) errors.date = 'Data non valida.';
  else {
    date = new Date(r.date).toISOString();
    if (Date.parse(date) > now.getTime() + 3_600_000) errors.date = 'Non puoi registrare un\'attività futura.';
    else if (Date.parse(date) < now.getTime() - 5 * 365 * 86_400_000) errors.date = 'Data troppo lontana nel tempo.';
  }
  if (!isSport(r.sport)) errors.sport = 'Scegli uno sport.';
  const dist = numOrNull(r.distanceKm);
  if (dist === undefined) errors.distanceKm = 'Inserisci un numero.';
  else if (dist !== null && (dist <= 0 || dist > LIMITS.distanceMax)) errors.distanceKm = `Tra 0,1 e ${LIMITS.distanceMax} km.`;
  const dur = numOrNull(r.durationMin);
  if (dur === undefined) errors.durationMin = 'Inserisci un numero.';
  else if (dur !== null && (dur < 1 || dur > 1440)) errors.durationMin = 'Tra 1 e 1440 minuti.';
  const note = clean(r.note, 200);
  if (note.length > 200) errors.note = 'Massimo 200 caratteri.';
  if (dist === null && dur === null && !errors.distanceKm && !errors.durationMin) errors.distanceKm = 'Indica almeno distanza o durata.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const title = clean(r.title, 80);
  return { ok: true, value: { date, sport: r.sport as SportId, distanceKm: dist ?? null, durationMin: dur ?? null, note, title } };
}

export function validateEmailPassword(email: unknown, password: unknown): FieldErrors {
  const errors: FieldErrors = {};
  const e = normalizeEmail(email);
  if (!EMAIL_RE.test(e) || e.length > 254) errors.email = 'Inserisci un indirizzo email valido.';
  if (typeof password !== 'string' || password.length < 8) errors.password = 'La password deve avere almeno 8 caratteri.';
  else if (password.length > 200) errors.password = 'Password troppo lunga.';
  return errors;
}
