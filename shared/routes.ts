import { newId, newToken } from './ids.ts';
import { AppError, registerPurger, toPublic, type Ctx } from './engine.ts';
import { haversineKm } from './time.ts';
import type { Id, LatLng, RouteInput, RouteView, RouteVisibility, SavedRoute } from './types.ts';
import { clean, type FieldErrors } from './validation.ts';

const VIS: RouteVisibility[] = ['private', 'link', 'public'];
const MAX_ROUTES_PER_USER = 100;
const MAX_POINTS = 2000;
const fKey = (rid: Id, uid: Id) => `${rid}__${uid}`;
const iso = (d: Date) => d.toISOString();

function point(v: unknown): LatLng | null | undefined {
  if (v === null || v === undefined) return null;
  const o = v as { lat?: unknown; lng?: unknown };
  if (typeof o?.lat !== 'number' || typeof o?.lng !== 'number' || !Number.isFinite(o.lat) || !Number.isFinite(o.lng) || Math.abs(o.lat) > 90 || Math.abs(o.lng) > 180) return undefined;
  return { lat: Math.round(o.lat * 1e5) / 1e5, lng: Math.round(o.lng * 1e5) / 1e5 };
}

export function polylineKm(pts: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineKm(pts[i - 1], pts[i]);
  return d;
}

export function validateRouteInput(raw: Partial<RouteInput> | null | undefined): { ok: true; value: RouteInput } | { ok: false; errors: FieldErrors } {
  const r = raw ?? {};
  const errors: FieldErrors = {};
  const name = clean(r.name, 80);
  if (name.length < 3) errors.name = 'Il nome deve avere almeno 3 caratteri.';
  else if (name.length > 80) errors.name = 'Massimo 80 caratteri.';
  const description = clean(r.description, 300);
  if (description.length > 300) errors.description = 'Massimo 300 caratteri.';
  const startName = clean(r.startName, 100);
  if (startName.length < 2) errors.startName = 'Indica il punto di partenza.';
  const endName = clean(r.endName, 100) || startName; // percorso ad anello: arrivo = partenza
  const area = clean(r.area, 60);
  const notes = clean(r.notes, 500);
  if (notes.length > 500) errors.notes = 'Massimo 500 caratteri.';
  if (!VIS.includes(r.visibility as RouteVisibility)) errors.visibility = 'Scegli chi può vedere il percorso.';

  const start = point(r.start);
  const end = point(r.end);
  if (start === undefined) errors.start = 'Coordinate di partenza non valide.';
  if (end === undefined) errors.end = 'Coordinate di arrivo non valide.';

  let geometry: LatLng[] | null = null;
  if (r.geometry !== null && r.geometry !== undefined) {
    if (!Array.isArray(r.geometry) || r.geometry.length < 2 || r.geometry.length > MAX_POINTS) errors.geometry = `La geometria deve avere da 2 a ${MAX_POINTS} punti.`;
    else {
      const pts = r.geometry.map(point);
      if (pts.some((p) => !p)) errors.geometry = 'Geometria non valida.';
      else geometry = pts as LatLng[];
    }
  }

  let distanceKm: number | null = null;
  if (r.distanceKm !== null && r.distanceKm !== undefined) {
    if (typeof r.distanceKm !== 'number' || !Number.isFinite(r.distanceKm) || r.distanceKm < 0.1 || r.distanceKm > 500) errors.distanceKm = 'La distanza deve essere tra 0,1 e 500 km.';
    else distanceKm = Math.round(r.distanceKm * 100) / 100;
  }
  let distanceSource: RouteInput['distanceSource'] = null;
  let geometryProvider: string | null = null;
  if (distanceKm !== null) {
    if (r.distanceSource === 'routing') {
      // Una distanza "da servizio di routing" deve essere coerente con la geometria ricevuta: nessuna distanza inventata.
      if (!geometry) errors.distanceKm = 'Distanza da routing senza geometria.';
      else {
        const real = polylineKm(geometry);
        if (Math.abs(real - distanceKm) > Math.max(0.3, real * 0.1)) errors.distanceKm = 'La distanza non corrisponde al tracciato.';
      }
      distanceSource = 'routing';
      geometryProvider = clean(r.geometryProvider, 40) || null;
      if (!geometryProvider) errors.geometry = 'Indica il fornitore del percorso.';
    } else distanceSource = 'manual';
  } else if (geometry) {
    errors.distanceKm = 'Con un tracciato serve anche la distanza.';
  }
  if (!geometry) geometryProvider = null;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, description, startName, endName, area, distanceKm, distanceSource, notes, start: start ?? null, end: end ?? null, geometry, geometryProvider, visibility: r.visibility as RouteVisibility },
  };
}

function actor(ctx: Ctx): Id {
  if (!ctx.actorId || !ctx.db.users[ctx.actorId]) throw new AppError('unauthenticated', 'Accedi per continuare.');
  return ctx.actorId;
}

function canView(ctx: Ctx, r: SavedRoute, token?: string | null): boolean {
  const uid = ctx.actorId;
  if (uid && r.ownerId === uid) return true;
  if (r.visibility === 'public') return true;
  if (r.visibility === 'link') return !!token && token === r.shareToken;
  return false;
}

function view(ctx: Ctx, r: SavedRoute): RouteView {
  const uid = ctx.actorId;
  const isOwner = !!uid && r.ownerId === uid;
  return {
    ...r,
    shareToken: isOwner ? r.shareToken : '',
    owner: toPublic(ctx.db, r.ownerId),
    isOwner,
    isFavorite: !!uid && !!ctx.db.routeFavorites[fKey(r.id, uid)],
    favoriteCount: Object.values(ctx.db.routeFavorites).filter((f) => f.routeId === r.id).length,
  };
}

function getOrThrow(ctx: Ctx, id: unknown): SavedRoute {
  const r = typeof id === 'string' ? ctx.db.routes[id] : undefined;
  if (!r) throw new AppError('not_found', 'Percorso non trovato.');
  return r;
}

export function createRoute(ctx: Ctx, input: RouteInput): RouteView {
  const uid = actor(ctx);
  const v = validateRouteInput(input);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  if (Object.values(ctx.db.routes).filter((r) => r.ownerId === uid).length >= MAX_ROUTES_PER_USER) throw new AppError('conflict', 'Hai raggiunto il numero massimo di percorsi salvati.');
  const r: SavedRoute = { id: newId('rte'), ownerId: uid, ...v.value, shareToken: newToken(), createdAt: iso(ctx.now), updatedAt: iso(ctx.now) };
  ctx.db.routes[r.id] = r;
  return view(ctx, r);
}

export function updateRoute(ctx: Ctx, id: Id, input: RouteInput): RouteView {
  const uid = actor(ctx);
  const r = getOrThrow(ctx, id);
  if (r.ownerId !== uid) throw new AppError('forbidden', 'Solo il proprietario può modificare il percorso.');
  const v = validateRouteInput(input);
  if (!v.ok) throw new AppError('validation', 'Controlla i campi evidenziati.', v.errors);
  Object.assign(r, v.value, { updatedAt: iso(ctx.now) });
  return view(ctx, r);
}

export function deleteRoute(ctx: Ctx, id: Id): { deleted: true } {
  const uid = actor(ctx);
  const r = getOrThrow(ctx, id);
  if (r.ownerId !== uid) throw new AppError('forbidden', 'Solo il proprietario può eliminare il percorso.');
  removeRoute(ctx, r.id);
  return { deleted: true };
}

function removeRoute(ctx: Ctx, id: Id) {
  delete ctx.db.routes[id];
  for (const f of Object.values(ctx.db.routeFavorites)) if (f.routeId === id) delete ctx.db.routeFavorites[fKey(f.routeId, f.userId)];
  for (const e of Object.values(ctx.db.events)) if (e.routeId === id) e.routeId = null; // le uscite restano, senza percorso
}

export function getRoute(ctx: Ctx, id: Id, token?: string | null): RouteView {
  const r = getOrThrow(ctx, id);
  const fav = !!ctx.actorId && !!ctx.db.routeFavorites[fKey(r.id, ctx.actorId)];
  if (!canView(ctx, r, token) && !fav) throw new AppError('not_found', 'Percorso non trovato o non accessibile.');
  return view(ctx, r);
}

export function listRoutes(ctx: Ctx, query?: { scope?: 'mine' | 'saved' | 'explore'; areaText?: string | null; minKm?: number | null; maxKm?: number | null } | null): RouteView[] {
  const q = query && typeof query === 'object' ? query : {};
  const scope = q.scope ?? 'explore';
  const uid = ctx.actorId;
  if ((scope === 'mine' || scope === 'saved') && !uid) throw new AppError('unauthenticated', 'Accedi per continuare.');
  const text = (q.areaText ?? '').trim().toLowerCase();
  const out: RouteView[] = [];
  for (const r of Object.values(ctx.db.routes)) {
    const mine = !!uid && r.ownerId === uid;
    const fav = !!uid && !!ctx.db.routeFavorites[fKey(r.id, uid)];
    if (scope === 'mine' && !mine) continue;
    if (scope === 'saved' && !fav) continue;
    if (scope === 'explore' && !(r.visibility === 'public' || mine)) continue;
    if (q.minKm != null && (r.distanceKm === null || r.distanceKm < q.minKm)) continue;
    if (q.maxKm != null && (r.distanceKm === null || r.distanceKm > q.maxKm)) continue;
    if (text && !`${r.name} ${r.startName} ${r.endName} ${r.area}`.toLowerCase().includes(text)) continue;
    out.push(view(ctx, r));
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 200);
}

export function setRouteFavorite(ctx: Ctx, id: Id, on: boolean, token?: string | null): RouteView {
  const uid = actor(ctx);
  const r = getOrThrow(ctx, id);
  if (!canView(ctx, r, token) && !ctx.db.routeFavorites[fKey(r.id, uid)]) throw new AppError('not_found', 'Percorso non trovato o non accessibile.');
  const key = fKey(r.id, uid);
  if (on && !ctx.db.routeFavorites[key]) ctx.db.routeFavorites[key] = { id: newId('fav'), routeId: r.id, userId: uid, createdAt: iso(ctx.now) };
  if (!on) delete ctx.db.routeFavorites[key];
  return view(ctx, r);
}

registerPurger((ctx, userId) => {
  for (const r of Object.values(ctx.db.routes)) if (r.ownerId === userId) removeRoute(ctx, r.id);
  for (const f of Object.values(ctx.db.routeFavorites)) if (f.userId === userId) delete ctx.db.routeFavorites[fKey(f.routeId, f.userId)];
});

export const routeMethods = { createRoute, updateRoute, deleteRoute, getRoute, listRoutes, setRouteFavorite } as const;
