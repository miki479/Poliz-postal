import { useEffect, useRef, useState } from 'react';
import type { LatLng } from '../../shared/types.ts';
import { useSession } from '../session.tsx';

/**
 * Mappa interattiva con Leaflet + tile OpenStreetMap (caricata solo quando serve).
 * Mostra SOLO punti e geometrie reali passati dal chiamante: non genera tracciati.
 * L'attribuzione è obbligatoria e resta sempre visibile. Se le tile non si caricano, la vista elenco resta utilizzabile.
 */
export function MapView({ start, end, geometry, onPick, height = 260, label }: { start?: LatLng | null; end?: LatLng | null; geometry?: LatLng[] | null; onPick?: (p: LatLng) => void; height?: number; label: string }) {
  const { backend } = useSession();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const state = useRef<{ L?: typeof import('leaflet'); map?: import('leaflet').Map; layer?: import('leaflet').LayerGroup }>({});
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (dead || !ref.current) return;
        const map = L.map(ref.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([42.5, 12.5], 5);
        const tiles = L.tileLayer(backend.ext.map.tileUrl, { maxZoom: 18, attribution: backend.ext.map.attribution, crossOrigin: true });
        tiles.on('tileerror', () => setError('Le tile della mappa non si caricano. Il percorso resta consultabile come elenco.'));
        tiles.addTo(map);
        const layer = L.layerGroup().addTo(map);
        map.on('click', (e: import('leaflet').LeafletMouseEvent) => pick.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
        state.current = { L, map, layer };
        draw();
      } catch {
        setError('Mappa non disponibile in questo momento. Puoi comunque usare le informazioni testuali.');
      }
    })();
    return () => {
      dead = true;
      try {
        state.current.map?.stop();
        state.current.map?.remove();
      } catch {
        /* la mappa era già stata smontata */
      }
      state.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const { L, map, layer } = state.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const pts: Array<[number, number]> = [];
    const dot = (p: LatLng, color: string, tip: string) => {
      L.circleMarker([p.lat, p.lng], { radius: 8, color: '#0b0f12', weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(tip).addTo(layer);
      pts.push([p.lat, p.lng]);
    };
    if (geometry?.length) {
      L.polyline(geometry.map((p) => [p.lat, p.lng] as [number, number]), { color: '#36e0e5', weight: 5, opacity: 0.9 }).addTo(layer);
      geometry.forEach((p) => pts.push([p.lat, p.lng]));
    }
    if (start) dot(start, '#3ddc97', 'Partenza');
    if (end && (!start || end.lat !== start.lat || end.lng !== start.lng)) dot(end, '#ff7a7a', 'Arrivo');
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 16, animate: false });
  }

  useEffect(draw, [start?.lat, start?.lng, end?.lat, end?.lng, geometry]);

  return (
    <div>
      <div ref={ref} role="application" aria-label={label} style={{ height, borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface-2)' }} />
      {error && <p className="hint" role="status">{error}</p>}
    </div>
  );
}
