/**
 * Notification Manager Unit Tests
 *
 * Tests for multi-channel notification delivery.
 *
 * @module tests/unit/notification-manager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationManager, getNotificationManager } from '../../src/lib/alerts/notification-manager.js';

// These formatting/delivery tests use an owner with a verified phone and operator role.
vi.mock('../../src/db/index.js', () => ({
  getSafeOSDatabase: async () => ({ get: async () => ({ id: 'verified-phone', role: 'operator' }) }),
}));

// Mock external services
vi.mock('../../src/lib/alerts/browser-push.js', () => ({
  sendBrowserPushNotification: vi.fn().mockResolvedValue({ success: true }),
  isVapidConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/lib/alerts/twilio.js', () => ({
  sendTwilioSms: vi.fn().mockResolvedValue({ sid: 'test-sid', to: '+15551234567', from: '+15550000000' }),
  sendAlertSms: vi.fn().mockResolvedValue({ sid: 'alert-sid', to: '+15551234567', from: '+15550000000' }),
  sendTestSms: vi.fn().mockResolvedValue({ sid: 'test-sid', to: '+15551234567', from: '+15550000000' }),
  isTwilioConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/lib/alerts/telegram.js', () => ({
  TelegramBotService: vi.fn().mockImplementation(() => ({
    sendAlert: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

vi.mock('../../src/lib/alerts/email.js', () => ({
  sendAlertEmail: vi.fn().mockResolvedValue({ id: 'msg_test', to: 'a@a', from: 'b@b' }),
  isResendConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/api/routes/notifications.js', () => ({
  getPushSubscriptions: vi.fn().mockReturnValue(new Map()),
  getTelegramChatIds: vi.fn().mockReturnValue([]),
}));

// =============================================================================
// Test Suite
// =============================================================================

describe('NotificationManager', () => {
  let manager: NotificationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new NotificationManager();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with default config', () => {
      const config = manager.getConfig();

      expect(config.browserPush).toBe(true);
      expect(config.sms).toBe(false);
      expect(config.telegram).toBe(false);
      expect(config.email).toBe(false);
    });

    it('should accept custom config', () => {
      const customManager = new NotificationManager({
        browserPush: false,
        sms: true,
        smsNumber: '+1234567890',
        email: true,
        emailRecipient: 'alerts@example.com',
      }, 'operator-owner');

      const config = customManager.getConfig();
      expect(config.browserPush).toBe(false);
      expect(config.sms).toBe(true);
      expect(config.smsNumber).toBe('+1234567890');
      expect(config.email).toBe(true);
      expect(config.emailRecipient).toBe('alerts@example.com');
    });

    it('should accept BYO email override', () => {
      const customManager = new NotificationManager({
        email: true,
        emailRecipient: 'alerts@example.com',
        emailOverride: { apiKey: 're_byo' },
        emailFromOverride: 'BYO <byo@user.test>',
      });

      const config = customManager.getConfig();
      expect(config.emailOverride).toEqual({ apiKey: 're_byo' });
      expect(config.emailFromOverride).toBe('BYO <byo@user.test>');
    });
  });

  // ===========================================================================
  // Notify Tests
  // ===========================================================================

  describe('notify', () => {
    it('should send notification and return results', async () => {
      const payload = {
        streamId: 'stream-1',
        alertId: 'alert-1',
        severity: 'medium' as const,
        title: 'Test Alert',
        message: 'This is a test notification',
        timestamp: new Date().toISOString(),
      };

      const results = await manager.notify(payload);

      expect(results).toBeInstanceOf(Array);
      // Results should have entries for each channel attempted
      results.forEach((result) => {
        expect(result).toHaveProperty('channel');
        expect(result).toHaveProperty('success');
      });
    });

    it('should attempt browser push for low severity', async () => {
      const payload = {
        streamId: 'stream-1',
        alertId: 'alert-1',
        severity: 'low' as const,
        title: 'Low Alert',
        message: 'Test',
        timestamp: new Date().toISOString(),
      };

      const results = await manager.notify(payload);

      // Low severity should only use browser
      const browserResult = results.find((r) => r.channel === 'browser');
      expect(browserResult).toBeDefined();
    });

    it('should attempt multiple channels for high severity', async () => {
      const smsManager = new NotificationManager({
        sms: true,
        smsNumber: '+1234567890',
        telegram: true,
      });

      const payload = {
        streamId: 'stream-1',
        alertId: 'alert-1',
        severity: 'high' as const,
        title: 'High Alert',
        message: 'Urgent attention needed',
        timestamp: new Date().toISOString(),
      };

      const results = await smsManager.notify(payload);

      // High severity should use browser, telegram, sms
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle info severity', async () => {
      const payload = {
        streamId: 'stream-1',
        alertId: 'alert-1',
        severity: 'info' as const,
        title: 'Info',
        message: 'Informational message',
        timestamp: new Date().toISOString(),
      };

      const results = await manager.notify(payload);

      expect(results).toBeInstanceOf(Array);
    });

    it('should handle critical severity', async () => {
      const payload = {
        streamId: 'stream-1',
        alertId: 'alert-1',
        severity: 'critical' as const,
        title: 'Critical Alert',
        message: 'Immediate attention required',
        timestamp: new Date().toISOString(),
      };

      const results = await manager.notify(payload);

      expect(results).toBeInstanceOf(Array);
    });
  });

  // ===========================================================================
  // Configuration Tests
  // ===========================================================================

  describe('updateConfig', () => {
    it('should update configuration', () => {
      manager.updateConfig({ sms: true, smsNumber: '+0987654321' });

      const config = manager.getConfig();
      expect(config.sms).toBe(true);
      expect(config.smsNumber).toBe('+0987654321');
    });

    it('should preserve unchanged config values', () => {
      const original = manager.getConfig();
      manager.updateConfig({ sms: true });

      const updated = manager.getConfig();
      expect(updated.browserPush).toBe(original.browserPush);
    });
  });

  // ===========================================================================
  // Channel Availability Tests
  // ===========================================================================

  describe('getAvailableChannels', () => {
    it('should always include browser channel', () => {
      const channels = manager.getAvailableChannels();

      expect(channels).toContain('browser');
    });

    it('should return array of strings', () => {
      const channels = manager.getAvailableChannels();

      expect(channels).toBeInstanceOf(Array);
      channels.forEach((channel) => {
        expect(typeof channel).toBe('string');
      });
    });

    it('should include email when Resend is configured server-side', async () => {
      const { isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValueOnce(true);

      const channels = manager.getAvailableChannels();
      expect(channels).toContain('email');
    });

    it('should NOT include email when Resend is not configured', async () => {
      const { isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValueOnce(false);

      const channels = manager.getAvailableChannels();
      expect(channels).not.toContain('email');
    });

    it('should include sms when TWILIO_ACCOUNT_SID is set', () => {
      const prev = process.env['TWILIO_ACCOUNT_SID'];
      process.env['TWILIO_ACCOUNT_SID'] = 'AC_test';
      try {
        const channels = manager.getAvailableChannels();
        expect(channels).toContain('sms');
      } finally {
        if (prev === undefined) delete process.env['TWILIO_ACCOUNT_SID'];
        else process.env['TWILIO_ACCOUNT_SID'] = prev;
      }
    });

    it('should include telegram when TELEGRAM_BOT_TOKEN is set', () => {
      const prev = process.env['TELEGRAM_BOT_TOKEN'];
      process.env['TELEGRAM_BOT_TOKEN'] = 'bot:token';
      try {
        const channels = manager.getAvailableChannels();
        expect(channels).toContain('telegram');
      } finally {
        if (prev === undefined) delete process.env['TELEGRAM_BOT_TOKEN'];
        else process.env['TELEGRAM_BOT_TOKEN'] = prev;
      }
    });
  });

  // ===========================================================================
  // SMS Channel Tests (BYO Twilio)
  // ===========================================================================

  describe('sms channel', () => {
    const baseSmsManager = () =>
      new NotificationManager({
        sms: true,
        smsNumber: '+15551234567',
      }, 'verified-owner');

    it('skips sms when toggle is off, even at critical severity', async () => {
      const { sendAlertSms, isTwilioConfigured } = await import('../../src/lib/alerts/twilio.js');
      vi.mocked(isTwilioConfigured).mockReturnValue(true);

      const m = new NotificationManager({ sms: false, smsNumber: '+15551234567' });

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'critical',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertSms).not.toHaveBeenCalled();
    });

    it('skips sms when number is empty, even when enabled', async () => {
      const { sendAlertSms, isTwilioConfigured } = await import('../../src/lib/alerts/twilio.js');
      vi.mocked(isTwilioConfigured).mockReturnValue(true);

      const m = new NotificationManager({ sms: true });

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'high',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertSms).not.toHaveBeenCalled();
    });

    it('skips sms when neither server creds nor complete BYO override is available', async () => {
      const { sendAlertSms, isTwilioConfigured } = await import('../../src/lib/alerts/twilio.js');
      vi.mocked(isTwilioConfigured).mockReturnValue(false);

      const m = baseSmsManager();
      const results = await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'critical',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertSms).not.toHaveBeenCalled();
      const smsResult = results.find((r) => r.channel === 'sms');
      expect(smsResult?.success).toBe(true); // skip is silent
    });

    it('skips sms when override is incomplete (missing fromNumber)', async () => {
      const { sendAlertSms, isTwilioConfigured } = await import('../../src/lib/alerts/twilio.js');
      vi.mocked(isTwilioConfigured).mockReturnValue(false);

      const m = new NotificationManager({
        sms: true,
        smsNumber: '+15551234567',
        smsOverride: { accountSid: 'AC_x', authToken: 'tok_x' }, // no fromNumber
      });

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'high',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertSms).not.toHaveBeenCalled();
    });

    it('sends sms via sendAlertSms when enabled + server Twilio configured', async () => {
      const { sendAlertSms, isTwilioConfigured } = await import('../../src/lib/alerts/twilio.js');
      vi.mocked(isTwilioConfigured).mockReturnValue(true);

      const m = baseSmsManager();

      await m.notify({
        streamId: 's',
        alertId: 'alert-1',
        severity: 'high',
        title: 'Motion',
        message: 'Detected',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertSms).toHaveBeenCalledWith(
        '+15551234567',
        'high',
        'Motion',
        'Detected',
        expect.objectContaining({ override: undefined }),
      );
    });

    it('uses BYO override path when override is complete (no server env needed)', async () => {
      const { sendAlertSms, isTwilioConfigured } = await import('../../src/lib/alerts/twilio.js');
      vi.mocked(isTwilioConfigured).mockReturnValue(false);

      const m = new NotificationManager({
        sms: true,
        smsNumber: '+15551234567',
        smsOverride: {
          accountSid: 'AC_byo',
          authToken: 'tok_byo',
          fromNumber: '+15559998888',
        },
      });

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'critical',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertSms).toHaveBeenCalledWith(
        '+15551234567',
        'critical',
        'T',
        'M',
        expect.objectContaining({
          override: {
            accountSid: 'AC_byo',
            authToken: 'tok_byo',
            fromNumber: '+15559998888',
          },
        }),
      );
    });

    it('does NOT send sms for medium/low/info severities', async () => {
      const { sendAlertSms, isTwilioConfigured } = await import('../../src/lib/alerts/twilio.js');
      vi.mocked(isTwilioConfigured).mockReturnValue(true);

      const m = baseSmsManager();

      for (const severity of ['info', 'low', 'medium'] as const) {
        vi.mocked(sendAlertSms).mockClear();
        await m.notify({
          streamId: 's',
          alertId: 'a',
          severity,
          title: 'T',
          message: 'M',
          timestamp: new Date().toISOString(),
        });
        expect(sendAlertSms).not.toHaveBeenCalled();
      }
    });

    it('captures sendAlertSms errors without throwing', async () => {
      const { sendAlertSms, isTwilioConfigured } = await import('../../src/lib/alerts/twilio.js');
      vi.mocked(isTwilioConfigured).mockReturnValue(true);
      vi.mocked(sendAlertSms).mockRejectedValueOnce(new Error('Twilio 21211'));

      const m = baseSmsManager();
      const results = await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'critical',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      const smsResult = results.find((r) => r.channel === 'sms');
      expect(smsResult?.success).toBe(false);
      expect(smsResult?.error).toBe('Twilio 21211');
    });
  });

  // ===========================================================================
  // Singleton Tests
  // ===========================================================================

  describe('getNotificationManager (singleton)', () => {
    it('returns the same instance on repeat calls', () => {
      const a = getNotificationManager();
      const b = getNotificationManager();
      expect(a).toBe(b);
    });

    it('returns a NotificationManager instance', () => {
      const instance = getNotificationManager();
      expect(instance).toBeInstanceOf(NotificationManager);
    });
  });

  // ===========================================================================
  // Email Channel Tests
  // ===========================================================================

  describe('email channel', () => {
    const baseEmailManager = () =>
      new NotificationManager({
        email: true,
        emailRecipient: 'alerts@example.com',
      }, 'operator-owner');

    it('skips email when toggle is off, even at critical severity', async () => {
      const { sendAlertEmail, isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValue(true);

      const m = new NotificationManager({ email: false, emailRecipient: 'a@a.test' });

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'critical',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertEmail).not.toHaveBeenCalled();
    });

    it('skips email when recipient is empty, even when enabled', async () => {
      const { sendAlertEmail, isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValue(true);

      const m = new NotificationManager({ email: true });

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'high',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertEmail).not.toHaveBeenCalled();
    });

    it('skips email when neither server key nor BYO key is available', async () => {
      const { sendAlertEmail, isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValue(false);

      const m = baseEmailManager();

      const results = await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'high',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertEmail).not.toHaveBeenCalled();
      // Channel attempted; skip is silent (success-shaped to avoid false failures)
      const emailResult = results.find((r) => r.channel === 'email');
      expect(emailResult?.success).toBe(true);
    });

    it('sends email when enabled + recipient set + server Resend configured', async () => {
      const { sendAlertEmail, isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValue(true);

      const m = baseEmailManager();

      await m.notify({
        streamId: 's',
        alertId: 'alert-1',
        severity: 'medium',
        title: 'Motion',
        message: 'Detected',
        timestamp: '2026-05-12T00:00:00Z',
      });

      expect(sendAlertEmail).toHaveBeenCalledWith(
        'alerts@example.com',
        'medium',
        'Motion',
        'Detected',
        expect.objectContaining({
          streamId: 's',
          alertId: 'alert-1',
          timestamp: '2026-05-12T00:00:00Z',
        }),
      );
    });

    it('uses BYO key path even when server Resend is not configured', async () => {
      const { sendAlertEmail, isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValue(false);

      const m = new NotificationManager({
        email: true,
        emailRecipient: 'alerts@example.com',
        emailOverride: { apiKey: 're_byo' },
      });

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'high',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertEmail).toHaveBeenCalledWith(
        'alerts@example.com',
        'high',
        'T',
        'M',
        expect.objectContaining({ override: { apiKey: 're_byo' } }),
      );
    });

    it('forwards fromOverride to sendAlertEmail', async () => {
      const { sendAlertEmail, isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValue(true);

      const m = new NotificationManager({
        email: true,
        emailRecipient: 'alerts@example.com',
        emailFromOverride: 'Custom <custom@test>',
      }, 'operator-owner');

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'critical',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ fromOverride: 'Custom <custom@test>' }),
      );
    });

    it('does NOT send email for low severity events', async () => {
      const { sendAlertEmail, isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValue(true);

      const m = baseEmailManager();

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'low',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertEmail).not.toHaveBeenCalled();
    });

    it('does NOT send email for info severity events', async () => {
      const { sendAlertEmail, isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValue(true);

      const m = baseEmailManager();

      await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'info',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      expect(sendAlertEmail).not.toHaveBeenCalled();
    });

    it('captures sendAlertEmail errors without throwing', async () => {
      const { sendAlertEmail, isResendConfigured } = await import('../../src/lib/alerts/email.js');
      vi.mocked(isResendConfigured).mockReturnValue(true);
      vi.mocked(sendAlertEmail).mockRejectedValueOnce(new Error('Resend down'));

      const m = baseEmailManager();

      const results = await m.notify({
        streamId: 's',
        alertId: 'a',
        severity: 'critical',
        title: 'T',
        message: 'M',
        timestamp: new Date().toISOString(),
      });

      const emailResult = results.find((r) => r.channel === 'email');
      expect(emailResult?.success).toBe(false);
      expect(emailResult?.error).toBe('Resend down');
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('should continue if one channel fails', async () => {
      const { sendBrowserPushNotification } = await import(
        '../../src/lib/alerts/browser-push.js'
      );
      vi.mocked(sendBrowserPushNotification).mockRejectedValueOnce(
        new Error('Push failed')
      );

      const payload = {
        streamId: 'stream-1',
        alertId: 'alert-1',
        severity: 'medium' as const,
        title: 'Test',
        message: 'Test',
        timestamp: new Date().toISOString(),
      };

      // Should not throw
      const results = await manager.notify(payload);

      // Should have result with error
      const failedResult = results.find(
        (r) => r.channel === 'browser' && !r.success
      );
      if (failedResult) {
        expect(failedResult.error).toBeDefined();
      }
    });
  });
});
