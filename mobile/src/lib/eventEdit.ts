/** Ogni tentativo è isolato: una risposta tardiva non aggiorna un altro modulo. */
export function loadEventForEdit<T>(fetchEvent: () => Promise<T>, onLoaded: (event: T) => void, onError: (message: string) => void): () => void {
  let active = true;
  void fetchEvent().then(
    (event) => { if (active) onLoaded(event); },
    () => { if (active) onError('Non riesco ad aprire l’uscita. Controlla la connessione e riprova.'); },
  );
  return () => { active = false; };
}
