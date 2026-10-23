export type Id = string;

export type SportId = 'running' | 'walking' | 'cycling' | 'padel' | 'football5';
export type Level = 'easy' | 'medium' | 'hard';
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
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'event_updated'
  | 'event_cancelled'
  | 'participant_joined'
  | 'club_member_joined'
  | 'challenge_joined'
  | 'challenge_ended';

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
  user: UserPublic & { username: string; bio: string; sports: SportId[]; area: string; createdAt: string };
  isSelf: boolean;
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
  | { kind: 'workout_shared'; id: string; at: string; user: UserPublic; workout: { title: string; kind: SessionKind; durationMin: number; distanceKm: number | null } };

export interface EventQuery {
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
}

export interface ClubInput {
  name: string;
  description: string;
  sport: SportId;
  area: string;
  imageDataUrl: string | null;
}

export interface ProfileInput {
  displayName: string;
  username: string;
  avatar: string | null;
  bio: string;
  sports: SportId[];
  area: string;
  privacy: PrivacySettings;
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
    /** Ritmo medio più veloce su attività di almeno 3 km con durata dichiarata. */
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

export type SessionStatus = 'planned' | 'completed' | 'skipped' | 'rescheduled';
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
  createdAt: string;
  updatedAt: string;
}

export interface SessionInput {
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

export type PlanGoal = 'start_running' | 'endurance' | 'distance' | 'pace' | 'strength_support';
export type PlanLevel = 'beginner' | 'intermediate' | 'advanced';

export interface TrainingPlan {
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

export interface WorkoutLog {
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
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutLogInput {
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
}

export interface ExerciseRoutine {
  id: Id;
  userId: Id;
  name: string;
  exercises: PlannedExercise[];
  createdAt: string;
  updatedAt: string;
}
