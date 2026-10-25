import { expect, it, vi } from 'vitest';
import { loadEventForEdit } from '../mobile/src/lib/eventEdit.ts';

it('offre un errore comprensibile e permette un nuovo tentativo riuscito', async () => {
  const loaded = vi.fn(); const error = vi.fn();
  const request = vi.fn().mockRejectedValueOnce(new Error('SQL internal failure')).mockResolvedValueOnce({ id: 'event' });
  loadEventForEdit(request, loaded, error);
  await Promise.resolve();
  expect(error).toHaveBeenCalledWith('Non riesco ad aprire l’uscita. Controlla la connessione e riprova.');
  expect(loaded).not.toHaveBeenCalled();
  loadEventForEdit(request, loaded, error);
  await Promise.resolve();
  expect(loaded).toHaveBeenCalledWith({ id: 'event' });
});

it('ignora la risposta dopo uscita dal modulo o cambio di tentativo', async () => {
  let resolve!: (value: string) => void;
  const loaded = vi.fn(); const error = vi.fn();
  const cancel = loadEventForEdit(() => new Promise<string>((ok) => { resolve = ok; }), loaded, error);
  cancel(); resolve('old'); await Promise.resolve();
  expect(loaded).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
});
