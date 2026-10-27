import { parseAppleHealthWorkouts, parseWorkoutFile, type ParseResult } from '../../shared/importers.ts';

const MAX_BYTES = 1_500_000_000; // export.xml di Apple Salute può essere molto grande: si legge a blocchi, mai tutto in memoria
const SMALL = 8_000_000;

/** Legge un file di allenamento scelto dall'utente. Tutto avviene nel browser: il file non viene caricato altrove. */
export async function readWorkoutFile(file: File, onProgress?: (pct: number) => void): Promise<ParseResult> {
  if (file.size > MAX_BYTES) throw new Error('File troppo grande.');
  if (file.size <= SMALL) return parseWorkoutFile(await file.text());

  // File grande: dev'essere l'export.xml di Apple Salute. Scansione a blocchi cercando solo i tag <Workout>.
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let read = 0;
  const all: ParseResult = { activities: [], skipped: 0, format: 'apple-health' };
  let first = true;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) {
      read += value.length;
      buf += value;
      if (first) {
        first = false;
        if (!/<HealthData[\s>]|<Workout\s/i.test(buf.slice(0, 20_000))) throw new Error('File grande non riconosciuto: serve l\'export.xml di Apple Salute.');
      }
      // Conserva la coda dopo l'ultimo '>' per non spezzare un tag tra due blocchi.
      const cut = buf.lastIndexOf('>');
      if (cut >= 0) {
        const part = parseAppleHealthWorkouts(buf.slice(0, cut + 1));
        all.activities.push(...part.activities);
        all.skipped += part.skipped;
        buf = buf.slice(cut + 1);
      }
      onProgress?.(Math.min(99, Math.round((read / file.size) * 100)));
    }
    if (done) break;
  }
  return all;
}
