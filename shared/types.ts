export type Id = string;

/**
 * Tipo di attività o di uscita. 'trail' = corsa su sentieri (il dislivello falsa il passo), 'run_walk' = corsa e camminata
 * alternate, 'other' = attività diversa (nessun record di prestazione). I valori già salvati restano tutti validi.
 */
export type SportId = 'running' | 'walking' | 'trail' | 'run_walk' | 'other' | 'cycling' | 'padel' | 'football5';
export type Level = 'beginner' | 'easy' | 'medium' | 'hard' | 'advanced';
export type Visibility = 'public' | 'club' | 'private';
export type EventStatus = 'active' | 'cancelled';

export interface PrivacySettings {
  /** Mostra le statistiche sul profilo pubblico. */
  showStats: boolean;
  /** Mostra i club a cui appartieni. */
  showClubs: boolean;
  /** Mostra le uscite future a cui partecipi. */
  showUpcoming: boolean;
  /** Le tue attività compaiono nel feed dei compagni di club. */
  shareActivity: boolean;
  /** Mostra sul profilo le qualità riconosciute dai compagni (consolidate). Assente = sì. */
  showRecognitions?: boolean;
}

/** Accento personale: resta confinato al profilo, non cambia i colori semantici dell'app. */
export type ProfileAccent = 'teal' | 'violet' | 'amber' | 'rose' | 'lime' | 'sky';
export type AvatarFrame = 'none' | 'ring' | 'double';

/** Personalizzazione pubblica del profilo. */
export interface ProfileStyle {
  accent: ProfileAccent;
  frame: AvatarFrame;
  /** Fino a 3 distintivi in evidenza (solo id di distintivi davvero ottenuti vengono mostrati). */
  featuredBadges: string[];
}

/** Solo il proprietario riceve questi dati, mai il profilo pubblico. */
export interface SetupPreferences {
  version: 1;
  step: number;
  completedAt: string | null;
  weightKg: number | null;
  heightCm: number | null;
  groupMatching: boolean;
  heatmapConsent: boolean;
}

/** Utente memorizzato. Non contiene email né segreti. */
export interface User {
  id: Id;
  /** Identificativo pubblico univoco (minuscolo), mostrato come @username. Non è una prova d'identità. */
  username: string;
  displayName: string;
  /** Data URL di un'immagine piccola (facoltativa). */
  avatar: string | null;
  /** false finché l'utente non ha scelto nome e username (può farlo più tardi). */
  profileCompleted: boolean;
  bio: string;
  /** Tonalità 0–359 usata per generare l'avatar. */
  hue: number;
  sports: SportId[];
  /** Località generale (es. "Forlì"), mai un indirizzo. */
  area: string;
  privacy: PrivacySettings;
  /** Assente per gli utenti creati prima della personalizzazione: si usa lo stile base. */
  style?: ProfileStyle;
  setup?: SetupPreferences;
  createdAt: string;
}

export interface Club {
  id: Id;
  name: string;
  description: string;
  sport: SportId;
  area: string;
  /** Data URL ridimensionata (facoltativa). */
  imageDataUrl: string | null;
  inviteCode: string;
  ownerId: Id;
  createdAt: string;
  /** Regole del gruppo, scritte dal fondatore (es. ritmo, puntualità, rispetto). */
  rules?: string;
  /** true = compare tra i gruppi suggeriti in Esplora e chi vuole può unirsi senza codice. */
  discoverable?: boolean;
}

export interface ClubMembership {
  id: string;
  clubId: Id;
  userId: Id;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface RunEvent {
  id: Id;
  clubId: Id | null;
  organizerId: Id;
  title: string;
  sport: SportId;
  /** Istante di partenza in UTC (ISO 8601). */
  startsAt: string;
  /** Fuso orario IANA nel quale l'organizzatore ha scelto data e ora. */
  timezone: string;
  meetingPlace: string;
  area: string;
  /** Coordinate approssimate del ritrovo, solo se l'organizzatore le ha condivise. */
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  paceSecPerKm: number | null;
  level: Level;
  notes: string;
  maxParticipants: number | null;
  visibility: Visibility;
  /** Percorso associato (facoltativo). */
  routeId: Id | null;
  /** Impegni dichiarati dall'organizzatore (non garanzie di sicurezza). */
  pact?: RunPact | null;
  status: EventStatus;
  /** Token per accedere alle uscite private tramite link. */
  inviteToken: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

export interface RunParticipation {
  id: string;
  eventId: Id;
  userId: Id;
  joinedAt: string;
}

export type ActivitySource = 'event' | 'manual' | 'strava' | 'file';
/** Classe di affidabilità mostrata in UI. "verified" è riservata a futuri dati certificati da un'integrazione: oggi nessuna fonte la produce. */
export type ActivityClass = 'self_declared' | 'imported' | 'verified';

export interface Activity {
  /** Dati del file privati: esclusi dal feed anche se il riepilogo viene condiviso. */
  fileData?: import('./fileMeasurements.ts').FileActivityData;
  id: Id;
  userId: Id;
  source: ActivitySource;
  eventId: Id | null;
  /** Identificativo nella fonte esterna (es. id attività Strava) per evitare doppie importazioni. */
  externalId: string | null;
  sport: SportId;
  title: string;
  /** Data/ora di inizio dell'attività (ISO UTC). */
  date: string;
  /** true se l'utente ha indicato solo il giorno (l'ora salvata è un segnaposto). */
  dayOnly: boolean;
  /** Distanza dichiarata o importata. Mai stimata dall'app. */
  distanceKm: number | null;
  durationMin: number | null;
  note: string;
  /** "shared": può contare in sfide/classifiche/feed. "private": solo personale (es. dati Strava). */
  visibility: 'shared' | 'private';
  planSessionId: Id | null;
  /** L'utente ha detto "no" alla proposta di associarla a una seduta. */
  planLinkDismissed?: boolean;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'workout_companion'
  | 'event_updated'
  | 'event_cancelled'
  | 'participant_joined'
  | 'club_member_joined'
  | 'challenge_joined'
  | 'challenge_ended'
  | 'new_follower'
  | 'new_comment'
  | 'club_invite'
  | 'event_invite';

export interface Notification {
  id: Id;
  userId: Id;
  type: NotificationType;
  text: string;
  eventId: Id | null;
  clubId: Id | null;
  challengeId: Id | null;
  createdAt: string;
  readAt: string | null;
}

export interface DbState {
  schema: 1;
  users: Record<Id, User>;
  clubs: Record<Id, Club>;
  memberships: Record<string, ClubMembership>;
  events: Record<Id, RunEvent>;
  participations: Record<string, RunParticipation>;
  activities: Record<Id, Activity>;
  notifications: Record<Id, Notification>;
  challenges: Record<Id, Challenge>;
  challengeParticipants: Record<string, ChallengeParticipant>;
  routes: Record<Id, SavedRoute>;
  routeFavorites: Record<string, RouteFavorite>;
  plans: Record<Id, TrainingPlan>;
  sessions: Record<Id, PlannedSession>;
  workoutLogs: Record<Id, WorkoutLog>;
  routines: Record<Id, ExerciseRoutine>;
  checkins: Record<Id, CheckIn>;
  planStates: Record<Id, PlanState>;
  planChanges: Record<Id, PlanChange>;
  goals: Record<Id, Goal>;
  recognitions: Record<string, Recognition>;
  recognitionRounds: Record<string, RecognitionRound>;
  reports: Record<Id, UserReport>;
  follows: Record<string, import('./social.ts').Follow>;
  clubInvites: Record<string, import('./invites.ts').ClubInvite>;
  gear: Record<string, import('./gear.ts').Gear>;
  eventInvites: Record<string, import('./eventInvites.ts').EventInvite>;
  workoutCompanions: Record<string, import('./workoutCompanions.ts').WorkoutCompanion>;
  sparks: Record<string, import('./social.ts').Spark>;
  comments: Record<Id, import('./social.ts').Comment>;
}

/* ---------- Viste restituite al client ---------- */

export interface UserPublic {
  id: Id;
  displayName: string;
  hue: number;
  avatar: string | null;
}

export type JoinBlock = 'login' | 'full' | 'cancelled' | 'past' | 'club_only' | 'organizer';

export interface RouteSummary {
  id: Id;
  name: string;
  startName: string;
  endName: string;
  distanceKm: number | null;
}

export interface EventView extends RunEvent {
  route: RouteSummary | null;
  organizer: UserPublic;
  club: { id: Id; name: string } | null;
  participantCount: number;
  spotsLeft: number | null;
  isFull: boolean;
  isPast: boolean;
  /** Vista ridotta: l'utente vede l'esistenza dell'uscita ma non luogo, note e partecipanti. */
  restricted: boolean;
  /** Nomi dei partecipanti: solo per utenti autenticati con accesso. */
  participants: UserPublic[] | null;
  viewer: {
    isOrganizer: boolean;
    isParticipant: boolean;
    canJoin: boolean;
    joinBlock: JoinBlock | null;
    canConfirmRun: boolean;
    hasConfirmedRun: boolean;
  };
}

export interface Me extends User {}

export interface ClubView extends Club {
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  members: Array<UserPublic & { role: 'owner' | 'member' }> | null;
  upcomingEvents: EventView[];
}

export interface LeaderboardRow {
  user: UserPublic;
  value: number;
  rank: number;
}

export type LeaderboardMetric = 'runs' | 'distance';

export interface Leaderboard {
  metric: LeaderboardMetric;
  since: string;
  rows: LeaderboardRow[];
}

export interface Stats {
  completedRuns: number;
  declaredDistanceKm: number;
  declaredDurationMin: number;
  upcomingCount: number;
  organizedCount: number;
}

export interface ProfileView {
  user: UserPublic & { username: string; bio: string; sports: SportId[]; area: string; createdAt: string; style: ProfileStyle };
  isSelf: boolean;
  /** Distintivi in evidenza (già filtrati: solo ottenuti) e conteggio; null se l'utente nasconde le statistiche. */
  badges: { featured: BadgeView[]; earned: number; total: number } | null;
  stats: Stats | null;
  clubs: Array<{ id: Id; name: string }> | null;
  upcoming: EventView[] | null;
  /** Solo per il proprietario. */
  activities: Activity[] | null;
  privacy: PrivacySettings | null;
}

export interface HomeView {
  me: Me;
  stats: Stats;
  nextEvents: EventView[];
  clubEvents: EventView[];
  nearbyPublic: EventView[];
  clubs: Array<{ id: Id; name: string; memberCount: number }>;
  friendActivity: FeedItem[];
  weekly: { completedRuns: number; organized: number; joined: number };
  unreadNotifications: number;
}

export type FeedItem =
  | { kind: 'event_created'; id: string; at: string; user: UserPublic; event: EventView }
  | { kind: 'event_joined'; id: string; at: string; user: UserPublic; event: EventView }
  | { kind: 'run_completed'; id: string; at: string; user: UserPublic; activity: Activity }
  | { kind: 'workout_shared'; id: string; at: string; user: UserPublic; workout: { title: string; kind: SessionKind; durationMin: number; distanceKm: number | null; track?: TrackPoint[]; medals?: Array<{ name: string; mark: string; unit: string; tone: string; record: boolean }> } };

export interface EventQuery {
  /** Filtro effimero: non memorizzare la posizione del richiedente. */
  nearby?: { lat: number; lng: number; radiusKm: number } | null;
  scope?: 'all' | 'mine' | 'clubs';
  sport?: SportId | null;
  level?: Level | null;
  /** Estremi della data in UTC. */
  from?: string | null;
  to?: string | null;
  minKm?: number | null;
  maxKm?: number | null;
  areaText?: string | null;
  includePast?: boolean;
}

/* ---------- Input ---------- */

export interface EventInput {
  title: string;
  sport: SportId;
  startsAt: string;
  timezone: string;
  meetingPlace: string;
  area: string;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  paceSecPerKm: number | null;
  level: Level;
  notes: string;
  maxParticipants: number | null;
  visibility: Visibility;
  clubId: Id | null;
  routeId: Id | null;
  pact?: RunPact | null;
}

/**
 * Patto di corsa: impegni dichiarati da chi organizza.
 * takeTurns, pairs e selfPace sono arrivati dopo: assenti = false, così i patti già salvati restano validi.
 * selfPace non si combina con noDrop né con inclusivePace (il server rifiuta la combinazione).
 */
export interface RunPact {
  /** Nessuno resta indietro: il gruppo aspetta. */
  noDrop: boolean;
  /** Il passo si adatta a chi è più lento. */
  inclusivePace: boolean;
  /** Punti di ricompattamento, testo libero breve. */
  regroupPoints: string;
  /** A turno: ci si alterna a guidare il gruppo. */
  takeTurns?: boolean;
  /** In coppia: si corre a coppie di ritmo simile. */
  pairs?: boolean;
  /** Self pace: ognuno al proprio ritmo, ci si ritrova all'arrivo. */
  selfPace?: boolean;
}

export interface ClubInput {
  name: string;
  description: string;
  sport: SportId;
  area: string;
  imageDataUrl: string | null;
  rules?: string;
  discoverable?: boolean;
}

export interface ProfileInput {
  displayName: string;
  username: string;
  avatar: string | null;
  bio: string;
  sports: SportId[];
  area: string;
  privacy: PrivacySettings;
  /** Facoltativo: se assente resta lo stile già salvato. */
  style?: ProfileStyle;
}

/* ---------- Distintivi ---------- */

export type BadgeCategory = 'community' | 'organize' | 'distance' | 'consistency' | 'club' | 'goal';

/** Distintivo calcolato dal server sui dati reali: nessun premio viene assegnato dal client. */
export interface BadgeView {
  id: string;
  name: string;
  /** Come si ottiene, in parole semplici. */
  criterion: string;
  category: BadgeCategory;
  earned: boolean;
  earnedAt: string | null;
  /** Avanzamento 0–1 se calcolabile, altrimenti null. */
  progress: number | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  /** Origine dei dati usati per il calcolo. */
  source: string;
}

export interface ActivityInput {
  title?: string;
  dayOnly?: boolean;
  date: string;
  sport: SportId;
  distanceKm: number | null;
  durationMin: number | null;
  note: string;
}

/* ---------- Sfide ---------- */

export type ChallengeType = 'most_runs' | 'most_distance' | 'most_active_days' | 'collective_distance' | 'personal_goal';

export interface ChallengeResultRow {
  userId: Id;
  value: number;
  /** Percentuale verso l'obiettivo (solo per obiettivo personale). */
  pct: number | null;
  rank: number;
  activities: number;
}

export interface ChallengeSnapshot {
  rows: ChallengeResultRow[];
  totalKm: number;
  finalizedAt: string;
}

export interface Challenge {
  id: Id;
  creatorId: Id;
  clubId: Id | null;
  name: string;
  description: string;
  type: ChallengeType;
  sport: SportId;
  startsAt: string;
  endsAt: string;
  timezone: string;
  /** Obiettivo collettivo in km (solo collective_distance). */
  goalKm: number | null;
  inviteCode: string;
  status: 'active' | 'cancelled';
  /** Risultato congelato dopo la chiusura: non cambia più con modifiche successive alle attività. */
  final: ChallengeSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeParticipant {
  id: string;
  challengeId: Id;
  userId: Id;
  /** Obiettivo individuale in km (solo personal_goal). */
  goalKm: number | null;
  joinedAt: string;
}

export interface ChallengeInput {
  name: string;
  description: string;
  type: ChallengeType;
  sport: SportId;
  startsAt: string;
  endsAt: string;
  timezone: string;
  goalKm: number | null;
  clubId: Id | null;
}

export type ChallengePhase = 'upcoming' | 'running' | 'closing' | 'ended' | 'cancelled';

export interface ChallengeRowView extends ChallengeResultRow {
  user: UserPublic;
  isMe: boolean;
}

export interface ChallengeView {
  id: Id;
  name: string;
  description: string;
  type: ChallengeType;
  sport: SportId;
  startsAt: string;
  endsAt: string;
  timezone: string;
  goalKm: number | null;
  clubId: Id | null;
  creator: UserPublic;
  phase: ChallengePhase;
  participantCount: number;
  rows: ChallengeRowView[];
  /** Totale del gruppo in km (obiettivo collettivo). */
  totalKm: number;
  /** Mostrato solo a creatore e partecipanti. */
  inviteCode: string;
  viewer: { isCreator: boolean; isParticipant: boolean; canJoin: boolean; myGoalKm: number | null; myRank: number | null };
  /** I dati contati sono autodichiarati (nessuna integrazione verificata). */
  dataNote: string;
  finalized: boolean;
}

/* ---------- Statistiche ---------- */

export interface PeriodTotals {
  runs: number;
  distanceKm: number;
  durationMin: number;
}

export interface PersonalStats {
  totals: PeriodTotals & { activeDays: number };
  week: PeriodTotals;
  month: PeriodTotals;
  prevMonth: PeriodTotals;
  monthDeltaKm: number | null;
  streakWeeks: number;
  bestStreakWeeks: number;
  records: {
    longestKm: { value: number; date: string } | null;
    bestWeekKm: { value: number; weekStart: string } | null;
    bestMonthKm: { value: number; month: string } | null;
    mostRunsInWeek: { value: number; weekStart: string } | null;
    /** Ritmo medio più veloce su attività di almeno 3 km con durata dichiarata (escluse trail, corsa + camminata e "Altro"). */
    fastestPace: { secPerKm: number; date: string; distanceKm: number } | null;
  };
  monthly: Array<{ month: string; label: string; runs: number; distanceKm: number }>;
  weekly: Array<{ weekStart: string; runs: number; distanceKm: number }>;
  byOrigin: { selfDeclared: number; imported: number; verified: number };
  hasData: boolean;
}

export interface ActivityFilter {
  from?: string | null;
  to?: string | null;
  sport?: SportId | null;
}

export interface ActivityView extends Activity {
  eventTitle: string | null;
  /** Classe mostrata all'utente. */
  cls: ActivityClass;
}

/* ---------- Percorsi ---------- */

export type RouteVisibility = 'private' | 'link' | 'public';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SavedRoute {
  id: Id;
  ownerId: Id;
  name: string;
  description: string;
  startName: string;
  endName: string;
  area: string;
  /** Distanza: se la geometria arriva da un servizio di routing è quella del servizio, altrimenti inserita a mano. */
  distanceKm: number | null;
  distanceSource: 'manual' | 'routing' | null;
  notes: string;
  start: LatLng | null;
  end: LatLng | null;
  /** Geometria reale (da servizio di routing), semplificata. Mai generata dall'app. */
  geometry: LatLng[] | null;
  /** Fornitore del percorso (attribuzione e tracciabilità). */
  geometryProvider: string | null;
  visibility: RouteVisibility;
  shareToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface RouteFavorite {
  id: string;
  routeId: Id;
  userId: Id;
  createdAt: string;
}

export interface RouteInput {
  name: string;
  description: string;
  startName: string;
  endName: string;
  area: string;
  distanceKm: number | null;
  distanceSource: 'manual' | 'routing' | null;
  notes: string;
  start: LatLng | null;
  end: LatLng | null;
  geometry: LatLng[] | null;
  geometryProvider: string | null;
  visibility: RouteVisibility;
}

export interface RouteView extends SavedRoute {
  owner: UserPublic;
  isOwner: boolean;
  isFavorite: boolean;
  favoriteCount: number;
}

/* ---------- Allenamento ---------- */

export type SessionKind =
  | 'run_easy'
  | 'run_continuous'
  | 'run_intervals'
  | 'run_progressive'
  | 'run_long'
  | 'run_free'
  | 'run_walk'
  | 'aerobic'
  | 'strength'
  | 'rest'
  | 'recovery_active'
  | 'mobility';

/** 'paused' = sospesa da pausa o vacanza (non è un fallimento). 'Non svolta' e 'in attesa di sincronizzazione' sono stati derivati, mai salvati. */
export type SessionStatus = 'planned' | 'completed' | 'skipped' | 'rescheduled' | 'paused';
export type Intensity = 'low' | 'moderate' | 'high';
export type MuscleGroup = 'legs' | 'glutes' | 'core' | 'back' | 'upper' | 'full';
export type EquipmentId = 'bodyweight' | 'dumbbells' | 'barbell' | 'machines' | 'bands' | 'kettlebell';

export interface Segment {
  kind: 'warmup' | 'run' | 'walk' | 'work' | 'recovery' | 'cooldown';
  label: string;
  durationSec: number;
  /** Il blocco si ripete `reps` volte (es. 8 cicli). */
  reps: number;
}

export interface PlannedExercise {
  name: string;
  muscle: MuscleGroup;
  equipment: EquipmentId;
  sets: number;
  reps: number;
  /** Carico previsto in kg (facoltativo). */
  loadKg: number | null;
  restSec: number;
}

export interface PlannedSession {
  skipReason?: import('./skipReasons.ts').SkipReason | null;
  guidedWorkoutId?: string | null;
  id: Id;
  userId: Id;
  planId: Id | null;
  /** Giorno di calendario locale "YYYY-MM-DD" (indipendente dal fuso). */
  date: string;
  time: string | null;
  kind: SessionKind;
  title: string;
  description: string;
  durationMin: number;
  distanceKm: number | null;
  intensity: Intensity | null;
  paceSecPerKm: number | null;
  warmupMin: number;
  cooldownMin: number;
  segments: Segment[];
  exercises: PlannedExercise[];
  notes: string;
  status: SessionStatus;
  rescheduledFrom: string | null;
  /** Uscita di gruppo collegata (se organizzata a partire da questa sessione). */
  eventId: Id | null;
  logId: Id | null;
  /** Attività reale (Strava, file, uscita) associata dall'utente a questa seduta. */
  linkedActivityId?: Id | null;
  /** Spunta manuale: non costituisce una registrazione o una misura. */
  manualDone?: boolean;
  /** Ultima modifica adattiva confermata dall'utente (sostituita, ridotta, spostata). */
  adjustment?: { action: AdjustAction; at: string; from: { kind: SessionKind; title: string; durationMin: number; date: string } } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionInput {
  guidedWorkoutId?: string | null;
  planId?: Id | null;
  date: string;
  time: string | null;
  kind: SessionKind;
  title: string;
  description: string;
  durationMin: number;
  distanceKm: number | null;
  intensity: Intensity | null;
  paceSecPerKm: number | null;
  warmupMin: number;
  cooldownMin: number;
  segments: Segment[];
  exercises: PlannedExercise[];
  notes: string;
}

export type PlanGoal = 'start_running' | 'endurance' | 'distance' | 'pace' | 'strength_support' | 'general_fitness' | 'race_5k' | 'race_10k' | 'half_marathon';
export type PlanLevel = 'beginner' | 'intermediate' | 'advanced';

export interface TrainingPlan {
  programId?: 'nhs-c25k';
  id: Id;
  userId: Id;
  name: string;
  goal: PlanGoal;
  level: PlanLevel;
  weekdays: number[];
  maxMinutes: number;
  equipment: EquipmentId[];
  preference: 'solo' | 'group' | 'mixed';
  /** Lunedì di inizio, "YYYY-MM-DD". */
  startDate: string;
  weeks: number;
  origin: 'manual' | 'wizard';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanWizardInput {
  name: string;
  goal: PlanGoal;
  level: PlanLevel;
  /** Giorni disponibili: 1 = lunedì … 7 = domenica. */
  weekdays: number[];
  maxMinutes: number;
  equipment: EquipmentId[];
  preference: 'solo' | 'group' | 'mixed';
  includeStrength: boolean;
  /** Aggiunge brevi sessioni facoltative di mobilità/flessibilità. */
  includeMobility?: boolean;
  startDate: string;
  weeks: number;
}

export interface LoggedSet {
  exercise: string;
  set: number;
  reps: number;
  loadKg: number | null;
  done: boolean;
}

/** Punto del tracciato GPS: coordinate e secondi trascorsi dall'inizio dell'allenamento. */
export interface TrackPoint {
  /** Segnale interrotto o pausa: non collegare al punto precedente. */
  breakBefore?: boolean;
  lat: number;
  lng: number;
  t: number;
  /** Altitudine GPS in metri, quando il telefono la fornisce (rumorosa: il dislivello è una stima). */
  alt?: number;
}

/**
 * Misure di un'attività quando la FONTE le fornisce davvero (riepilogo Strava). Un campo assente è `null`: mai un valore
 * predefinito. Frequenza cardiaca, dislivello e cadenza non arrivano da registrazioni dell'app (nessun sensore collegato).
 */
export interface ActivityMetrics {
  movingSec: number | null;
  elapsedSec: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  elevGainM: number | null;
  maxSpeedKmh: number | null;
  /** Passi al minuto (Strava indica una gamba sola per la corsa: qui è già raddoppiata). */
  cadenceSpm: number | null;
  calories: number | null;
  avgWatts: number | null;
}

/** Riepilogo scritto dal Coach AI (o generato dalle regole se l'AI non è disponibile) per un allenamento concluso. */
export interface WorkoutBrief {
  evidenceVersion?: number;
  text: string;
  at: string;
  /** true se prodotto dal Coach AI; false se è il riepilogo automatico basato sulle regole. */
  ai: boolean;
}

export interface WorkoutLog {
  /** Protocollo scelto, non una certificazione dello svolgimento. */
  guidedWorkoutId?: string | null;
  id: Id;
  userId: Id;
  plannedSessionId: Id | null;
  kind: SessionKind;
  title: string;
  startedAt: string;
  durationSec: number;
  distanceKm: number | null;
  /** Ritmo derivato SOLO da distanza e durata inserite dall'utente. */
  paceSecPerKm: number | null;
  /** Fatica percepita 1–10, soggettiva. */
  rpe: number | null;
  difficulties: string;
  notes: string;
  sets: LoggedSet[];
  mode: 'manual' | 'timer';
  activityId: Id | null;
  /** L'utente ha scelto di condividere il completamento con i compagni di club. */
  shared: boolean;
  /** Scelta esplicita per la mappa aggregata anonima (non abilita il percorso nel feed). */
  mapShared?: boolean;
  /** Scelta esplicita per mostrare ai compagni una traccia con partenza/arrivo protetti. */
  traceShared?: boolean;
  /** Attrezzatura scelta esplicitamente dal proprietario. */
  gearId?: Id | null;
  /** Tracciato registrato dal GPS dell'app (semplificato). Assente per i log inseriti a mano. */
  track?: TrackPoint[] | null;
  /** Contesto della registrazione nell'app. */
  sport?: 'running' | 'walking';
  /**
   * Corsa su sentieri (trail), con sport 'running': oggi arriva solo dalle attività Strava "TrailRun".
   * Il dislivello falsa passo e tempi, quindi ha record propri di distanza e durata. Assente = corsa su strada o pista.
   */
  trail?: boolean;
  environment?: 'outdoor' | 'treadmill';
  /** Da dove viene la distanza: GPS dell'app, inserita a mano, o nessuna. */
  distanceSource?: 'gps' | 'manual' | null;
  /** Interruzioni del segnale o dell'app durante la registrazione: la traccia non copre quei tratti. */
  gpsQuality?: { gaps: number; lostSec: number } | null;
  /** Uscita di gruppo corsa insieme (presenza confermata dalla registrazione). */
  eventId?: Id | null;
  /** Distanza o durata corrette a mano dopo la registrazione: esclusa dai record calcolati sulla traccia. */
  edited?: boolean;
  /** 'strava' = nato da un'attività importata: tracciato senza tempi, sempre privato. */
  origin?: 'app' | 'strava' | 'file';
  fileSamples?: import('./fileMeasurements.ts').FileSample[];
  fileSummary?: import('./fileMeasurements.ts').FileSummary;
  /** Consenso per aggregare questa traccia nella mappa di calore. */
  heatmapConsent?: boolean;
  /** Briefing dopo l'allenamento. */
  brief?: WorkoutBrief | null;
  /** Misure fornite dalla fonte (Strava): vedi ActivityMetrics. */
  metrics?: ActivityMetrics | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutLogInput {
  guidedWorkoutId?: string | null;
  heatmapConsent?: boolean;
  plannedSessionId?: Id | null;
  kind: SessionKind;
  title: string;
  startedAt: string;
  durationSec: number;
  distanceKm: number | null;
  rpe: number | null;
  difficulties: string;
  notes: string;
  sets: LoggedSet[];
  mode: 'manual' | 'timer';
  shared: boolean;
  timezone: string;
  track?: TrackPoint[] | null;
  sport?: 'running' | 'walking';
  environment?: 'outdoor' | 'treadmill';
  distanceSource?: 'gps' | 'manual' | null;
  gpsQuality?: { gaps: number; lostSec: number } | null;
  eventId?: Id | null;
}

export interface ExerciseRoutine {
  id: Id;
  userId: Id;
  name: string;
  exercises: PlannedExercise[];
  createdAt: string;
  updatedAt: string;
}

/* ---------- Piano adattivo ---------- */

export type CheckInKind = 'feeling' | 'time' | 'pain' | 'illness';

/** Check-in facoltativo e privato: mai condiviso con club, feed o Fama. */
export interface CheckIn {
  id: Id;
  userId: Id;
  /** Giorno locale "YYYY-MM-DD". */
  date: string;
  kind: CheckInKind;
  /** Stanchezza percepita 1 (molto stanco) – 5 (in forma). Non è dolore né motivazione. */
  energy: number | null;
  /** Minuti disponibili oggi. */
  minutes: number | null;
  pain: { area: string; level: 'mild' | 'moderate' | 'severe'; trend: 'new' | 'persistent' | 'worse'; urgent: boolean } | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type PlanMode = 'active' | 'paused' | 'vacation';

export interface PlanState {
  userId: Id;
  mode: PlanMode;
  from: string | null;
  until: string | null;
  vacation: { style: 'pause' | 'reduced'; maxMinutes: number | null } | null;
  updatedAt: string;
}

export type AdjustAction = 'swap_easy' | 'shorten' | 'move' | 'skip' | 'pause' | 'vacation' | 'resume';

export interface SessionChangePreview {
  sessionId: Id;
  label: string;
  before: { date: string; title: string; kind: SessionKind; durationMin: number; status: SessionStatus };
  after: { date: string; title: string; kind: SessionKind; durationMin: number; status: SessionStatus };
}

/** Modifica confermata: conserva lo stato precedente per poterla annullare. */
export interface PlanChange {
  id: Id;
  userId: Id;
  action: AdjustAction;
  requestId: string;
  createdAt: string;
  undone: boolean;
  /** Copie complete delle sedute prima e dopo (per l'annullamento sicuro). */
  sessions: Array<{ before: PlannedSession; afterUpdatedAt: string }>;
  stateBefore: PlanState | null;
  stateAfter: PlanState | null;
}

export type GoalType = 'consistency' | 'weekly_minutes' | 'weekly_km' | 'group';

export interface Goal {
  id: Id;
  userId: Id;
  type: GoalType;
  /** Uscite/settimana, minuti/settimana, km/settimana, uscite di gruppo/mese. */
  target: number;
  /** Da dove viene il valore (storico o risposte dell'utente). */
  basis: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

/* ---------- Fama: riconoscimenti post-corsa ---------- */

export type RecognitionCategory = 'teamwork' | 'keeps_group' | 'organization' | 'shares_experience' | 'pace_setter';

export interface Recognition {
  id: string;
  eventId: Id;
  fromId: Id;
  toId: Id;
  category: RecognitionCategory;
  createdAt: string;
}

/** Turno di riconoscimenti di una persona per un'uscita: una sola volta, anche se sceglie "non ho elementi". */
export interface RecognitionRound {
  id: string;
  eventId: Id;
  userId: Id;
  skipped: boolean;
  createdAt: string;
}

/** Segnalazione privata: canale separato, non tocca la Fama. */
export interface UserReport {
  id: Id;
  fromId: Id;
  aboutId: Id | null;
  eventId: Id | null;
  reason: 'conduct' | 'harassment' | 'organization' | 'dispute' | 'other';
  text: string;
  status: 'open' | 'closed';
  createdAt: string;
}

/** Serie temporali di un'attività (da Strava, a richiesta): sempre dalla fonte, mai ricostruite. */
export interface ActivityStreams {
  /** Distanza cumulata in km per ogni punto (asse comune dei grafici). */
  distKm: number[];
  hr: number[] | null;
  alt: number[] | null;
  cadence: number[] | null;
  /** Dislivello positivo/negativo calcolato dall'altitudine della fonte (soglia 3 m). */
  elevGainM: number | null;
  elevLossM: number | null;
}

