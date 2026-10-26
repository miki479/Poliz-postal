import { useMemo } from 'react';
import Svg,{Path} from 'react-native-svg';
import { ActivityGlyph } from '@/components/SportIcon';
import type { ActivityStyle } from '@/constants/activityColors';
import { routeThumbnailPaths } from '@/lib/routeThumbnail';
import type { TrackPoint } from '@shared/types.ts';
export function RouteThumbnail({track,style}:{track?:TrackPoint[]|null;style:ActivityStyle}){
 const paths=useMemo(()=>routeThumbnailPaths(track??[],64,56),[track]);
 return paths.length?<Svg width={64} height={56} viewBox="0 0 64 56" accessibilityLabel="Miniatura del percorso GPS"><Path d={paths.join(' ')} fill="none" stroke={style.solid} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/></Svg>:<ActivityGlyph style={style} size={28} color={style.solid}/>;
}
