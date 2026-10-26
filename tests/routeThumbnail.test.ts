import {expect,it} from 'vitest';
import {routeThumbnailPaths} from '../mobile/src/lib/routeThumbnail.ts';
it('non traccia una linea attraverso un’interruzione della miniatura',()=>{
 const track=[{lat:44,lng:12,t:0},{lat:44.0003,lng:12,t:5},{lat:44.001,lng:12,t:20,breakBefore:true},{lat:44.0013,lng:12,t:25}];
 const paths=routeThumbnailPaths(track,64,56);expect(paths).toHaveLength(2);expect(paths.every((p)=>p.startsWith('M'))).toBe(true);expect(paths.join()).not.toMatch(/NaN|Infinity/);
});
it('non presenta rumore da fermo o assenza GPS come un percorso',()=>{expect(routeThumbnailPaths([],64,56)).toEqual([]);expect(routeThumbnailPaths([{lat:44,lng:12,t:0},{lat:44.000001,lng:12,t:5}],64,56)).toEqual([]);});
