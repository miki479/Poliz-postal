import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleMobileAttempts } from '../server/googleMobile.ts';
import { googleLogin, type GoogleAttempt } from '../mobile/src/lib/googleLogin.ts';

afterEach(() => vi.useRealTimers());
describe('Accesso Google mobile: scambio riservato e monouso', () => {
  it('browser e app hanno segreti distinti, solo l’app può aprire la sessione una volta', async () => {
    const flow = new GoogleMobileAttempts(); const attempt = flow.begin();
    expect(() => flow.poll(attempt.id, attempt.browserToken)).toThrow();
    expect(() => flow.browser(attempt.id, attempt.pollToken)).toThrow();
    expect(flow.poll(attempt.id, attempt.pollToken)).toBeNull();
    const expectedNonce = flow.browser(attempt.id, attempt.browserToken);
    const verify = vi.fn(async (nonce: string) => { expect(nonce).toBe(expectedNonce); return 'user'; });
    await flow.complete(attempt.id, attempt.browserToken, verify);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(() => flow.browser(attempt.id, attempt.browserToken)).toThrow();
    expect(flow.poll(attempt.id, attempt.pollToken)).toBe('user');
    expect(() => flow.poll(attempt.id, attempt.pollToken)).toThrow();
  });
  it('nonce verificato, scadenza e annullamento impediscono il riuso', async () => {
    const flow = new GoogleMobileAttempts(); const attempt = flow.begin();
    await expect(flow.complete(attempt.id, attempt.browserToken, async () => { throw new Error('Nonce non valido'); })).rejects.toThrow(/Nonce/);
    expect(() => flow.poll(attempt.id, attempt.pollToken)).toThrow();
    const expired = flow.begin(0);
    expect(() => flow.browser(expired.id, expired.browserToken, 300001)).toThrow(/scaduto/);
    const cancelled = flow.begin(); flow.cancel(cancelled.id, cancelled.pollToken);
    expect(() => flow.browser(cancelled.id, cancelled.browserToken)).toThrow();
  });
  it('due completamenti concorrenti non possono cambiare l’account scelto', async () => {
    const flow = new GoogleMobileAttempts(); const attempt = flow.begin();
    let finish!: (value: string) => void;
    const first = flow.complete(attempt.id, attempt.browserToken, () => new Promise((resolve) => { finish = resolve; }));
    await expect(flow.complete(attempt.id, attempt.browserToken, async () => 'attacker')).rejects.toThrow();
    finish('original'); await first;
    expect(flow.poll(attempt.id, attempt.pollToken)).toBe('original');
  });
});

const attempt: GoogleAttempt = { id: 'attempt', pollToken: 'private-app-key', expiresAt: Date.now() + 300000, path: '/api/auth/google/mobile/page#id=attempt&key=browser-key' };
const transport = () => ({ start: vi.fn(async () => attempt), open: vi.fn(async (_path: string) => ({ type: 'opened' })), poll: vi.fn(async (_attempt: GoogleAttempt) => ({ status: 'complete' as 'pending' | 'complete' })), cancel: vi.fn(async (_attempt: GoogleAttempt) => {}), wait: vi.fn(async () => {}), cancelled: vi.fn(() => false) });

describe('Accesso Google mobile: coordinamento browser e app', () => {
  it('usa lo scambio HTTP dal client e non mette il segreto di polling nell’URL', async () => {
    const t = transport(); expect(await googleLogin(t)).toBe(true);
    expect(t.open.mock.calls[0][0]).not.toContain(attempt.pollToken);
    expect(t.poll).toHaveBeenCalledWith(attempt);
  });
  it('la chiusura del browser senza consenso annulla e libera il tentativo', async () => {
    const t = transport(); t.open.mockResolvedValue({ type: 'dismiss' }); t.poll.mockResolvedValue({ status: 'pending' });
    expect(await googleLogin(t)).toBe(false); expect(t.cancel).toHaveBeenCalledWith(attempt); expect(t.wait).not.toHaveBeenCalled();
  });
  it('non completa una richiesta annullata mentre era in corso il polling', async () => {
    const t = transport(); let cancelled = false;
    t.cancelled.mockImplementation(() => cancelled);
    t.poll.mockImplementation(async () => { cancelled = true; return { status: 'complete' }; });
    expect(await googleLogin(t)).toBe(false);
  });
  it('rifiuta un percorso esterno e gestisce la scadenza senza loop infinito', async () => {
    const t = transport(); t.start.mockResolvedValue({ ...attempt, path: 'https://example.invalid' });
    await expect(googleLogin(t)).rejects.toThrow(/non disponibile/);
    expect(t.open).not.toHaveBeenCalled();
    t.start.mockResolvedValue({ ...attempt, expiresAt: 1 });
    await expect(googleLogin(t)).rejects.toThrow(/scaduto/);
  });
});
