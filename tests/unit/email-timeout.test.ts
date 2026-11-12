import { it, expect, vi } from 'vitest';
import { sendEmail } from '../../src/lib/alerts/email.js';

vi.mock('../../src/lib/alerts/mail-suppression.js', () => ({
  getMailSuppressionStore: () => ({ issueToken: async () => 'token', isSuppressed: async () => false }),
}));

it('aborts an unanswered mail request after fifteen seconds', async () => {
  vi.stubEnv('SAFEOS_API_PUBLIC_URL', 'https://api.example.com');
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const fetch = vi.fn((_url: unknown, options: RequestInit) => {
    signal = options.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  });
  vi.stubGlobal('fetch', fetch);
  try {
    const pending = sendEmail({ kind: 'alert', to: 'owner@example.com', subject: 'Alert', html: '<p>Alert</p>',
      override: { apiKey: 'personal', from: 'alerts@example.com' } });
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(15000);
    expect(signal?.aborted).toBe(true);
    await rejected;
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});
