import { haversineKm } from './time.ts';
import type { TrackPoint } from './types.ts';

/** Filtro di sola visualizzazione: i campioni memorizzati non vengono modificati. */
export function displayTrack(raw: TrackPoint[]): { points: TrackPoint[]; segments: TrackPoint[][]; filtered: boolean } {
 const points:TrackPoint[]=[]; let interrupted=false; let filtered=false;
 const timed=raw.length>1 && raw[raw.length-1].t>raw[0].t;
 const intervals=raw.slice(1).map((p,i)=>p.t-raw[i].t).filter(dt=>Number.isFinite(dt)&&dt>0).sort((a,b)=>a-b);
 const gapAfter=Math.max(30,(intervals[Math.floor(intervals.length/2)]??2)*4);
 for(const point of raw){
  const previous=points[points.length-1];
  if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||Math.abs(point.lat)>90||Math.abs(point.lng)>180||!Number.isFinite(point.t)) {interrupted=true;filtered=true;continue;}
  const dt=previous ? point.t-previous.t : 0;
  if(timed&&previous&&(dt<0||(dt>0&&dt<=gapAfter&&!point.breakBefore&&haversineKm(previous,point)*1000/dt>20))){interrupted=true;filtered=true;continue;}
  const gap=!!previous&&(interrupted||point.breakBefore===true||(timed&&dt>gapAfter));
  points.push(gap?{...point,breakBefore:true}:{...point});interrupted=false;
 }
 const segments:TrackPoint[][]=[];
 for(const point of points){if(!segments.length||point.breakBefore)segments.push([]);segments[segments.length-1].push(point);}
 return {points,segments:segments.filter(s=>s.length>1),filtered};
}
