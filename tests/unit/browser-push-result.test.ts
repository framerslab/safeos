import { it, expect, vi } from 'vitest';
import { sendBrowserPushNotification } from '../../src/lib/alerts/browser-push.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn().mockResolvedValue([{ address: '142.250.1.1', family: 4 }]) }));

it('does not report delivery when browser push is unconfigured', async () => {
  vi.stubEnv('VAPID_PUBLIC_KEY', '');
  vi.stubEnv('VAPID_PRIVATE_KEY', '');
  try {
    await expect(sendBrowserPushNotification({ endpoint: 'https://fcm.googleapis.com/push/owner',
      keys: { p256dh: 'key', auth: 'auth' } }, { title: 'Alert', body: 'Check monitoring' })).rejects.toThrow();
  } finally { vi.unstubAllEnvs(); }
});
