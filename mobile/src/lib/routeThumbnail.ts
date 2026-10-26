import { displayTrack } from '../../../shared/routeDisplay.ts';
import type { TrackPoint } from '../../../shared/types.ts';
import { haversineKm } from '../../../shared/time.ts';
import { fitProjector } from './routeGeometry';
export function routeThumbnailPaths(track:TrackPoint[],width:number,height:number):string[]{
 const data=displayTrack(track);if(data.points.length<2)return [];
 const lat=data.points.map((p)=>p.lat),lng=data.points.map((p)=>p.lng);
 if(haversineKm({lat:Math.min(...lat),lng:Math.min(...lng)},{lat:Math.max(...lat),lng:Math.max(...lng)})<.025)return [];
 const project=fitProjector(data.points,width,height,7);
 return data.segments.map((segment)=>segment.map((p,i)=>{const v=project(p);return `${i?'L':'M'}${v.x.toFixed(2)} ${v.y.toFixed(2)}`;}).join(' '));
}
