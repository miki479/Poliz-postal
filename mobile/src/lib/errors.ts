/**
 * Messaggi per l'utente: sempre in italiano e comprensibili. Le eccezioni tecniche (RangeError di Date, errori di
 * rete del motore JS) non arrivano mai a schermo; il messaggio dei nostri errori di dominio sì, perché è già scritto per l'utente.
 */
const TECH: Array<[RegExp, string]> = [
  [/Date value out of bounds|Invalid time value|Invalid Date/i, 'La data o l’ora non sono valide. Scegli di nuovo quando si corre.'],
  [/Network request failed|Failed to fetch|network/i, 'Non riesco a raggiungere il server. Controlla la connessione e riprova.'],
  [/JSON|Unexpected token|undefined is not|null is not|Cannot read|is not a function|Maximum call stack/i, 'Qualcosa non ha funzionato. Riprova tra un momento.'],
  [/timeout|timed out/i, 'Ci mette troppo. Riprova tra un momento.'],
];

export function humanError(e: unknown, fallback = 'Qualcosa è andato storto. Riprova.'): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (!msg) return fallback;
  for (const [re, text] of TECH) if (re.test(msg)) return text;
  // Errori di dominio (ApiError) sono già in italiano; altri messaggi in inglese si sostituiscono con il fallback.
  return /[àèéìòù]|\b(il|la|non|hai|puoi|scegli|controlla|serve|devi)\b/i.test(msg) ? msg : fallback;
}

/** Data valida e (opzionale) nel futuro; restituisce il messaggio d'errore oppure null. */
export function checkDate(d: Date, opts: { future?: boolean } = {}): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'La data o l’ora non sono valide.';
  if (opts.future && d.getTime() < Date.now() - 5 * 60_000) return 'Scegli un momento nel futuro.';
  if (d.getFullYear() > new Date().getFullYear() + 2) return 'La data è troppo lontana: scegli entro i prossimi due anni.';
  return null;
}
