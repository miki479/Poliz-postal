import type { ComponentProps } from 'react';
import { RouteReplay } from './RouteReplay';
/** Tutte le attività usano la stessa geometria nativa, anche con interruzioni. */
export function ActivityRouteReplay(props:ComponentProps<typeof RouteReplay>){return <RouteReplay {...props}/>;}
