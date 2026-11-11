/**
 * Notification Manager
 *
 * Orchestrates multi-channel alert notifications.
 *
 * @module lib/alerts/notification-manager
 */

import { TelegramBotService } from './telegram';
import { sendAlertSms, isTwilioConfigured, type TwilioConfig } from './twilio';
import { sendBrowserPushNotification } from './browser-push';
import { sendAlertEmail, isResendConfigured, type EmailConfig } from './email';
import { getSafeOSDatabase } from '../../db/index.js';
import { getPushSubscriptions, getTelegramChatIds } from '../../api/routes/notifications';

// =============================================================================
// Types
// =============================================================================

export interface NotificationPayload {
  streamId: string;
  alertId: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  thumbnailUrl?: string;
  timestamp: string;
}

export interface NotificationConfig {
  browserPush: boolean;
  sms: boolean;
  telegram: boolean;
  email: boolean;
  smsNumber?: string;
  telegramChatId?: string;
  /** Owner-supplied bot token; server bot registrations have no verified recipient. */
  telegramBotToken?: string;
  emailRecipient?: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  quietHoursTimeZone?: string | null;
  /** Local weekdays, Sunday = 0. */
  quietHoursDays?: number[];
  /** Optional per-user override (BYO Resend API key). Falls back to server env. */
  emailOverride?: Partial<EmailConfig>;
  /** Optional per-user "From" address override. */
  emailFromOverride?: string;
  /** Optional per-user Twilio override (BYO SID + auth token + from number). */
  smsOverride?: Partial<TwilioConfig>;
}

export interface NotificationResult {
  channel: string;
  success: boolean;
  /** A destination accepted delivery before another destination timed out. */
  delivered?: boolean;
  /** True when authorization or recipient suppression prevents delivery. */
  skipped?: boolean;
  error?: string;
}

// =============================================================================
// Constants
// =============================================================================

const SEVERITY_CHANNELS: Record<string, string[]> = {
  info: ['browser'],
  low: ['browser'],
  medium: ['browser', 'telegram', 'email'],
  high: ['browser', 'telegram', 'sms', 'email'],
  critical: ['browser', 'telegram', 'sms', 'email'],
};

// =============================================================================
// NotificationManager Class
// =============================================================================

/** Hold only low/medium alerts on selected local weekdays; urgency always wins. */
export function isQuietHours(config: Partial<NotificationConfig>, severity: NotificationPayload['severity']): boolean {
  if (severity !== 'low' && severity !== 'medium') return false;
  const parse = (value: string | null | undefined): number | null => {
    if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const start = parse(config.quietHoursStart);
  const end = parse(config.quietHoursEnd);
  if (start === null || end === null || start === end) return false;
  if (!config.quietHoursTimeZone) {
    console.warn('[NotificationManager] Quiet hours were not applied: no saved time zone');
    return false;
  }
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: config.quietHoursTimeZone, hourCycle: 'h23',
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date());
  } catch {
    console.warn('[NotificationManager] Quiet hours were not applied: invalid saved time zone');
    return false;
  }
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday') ?? '');
  if (!config.quietHoursDays?.includes(day)) return false;
  const current = Number(value('hour')) * 60 + Number(value('minute'));
  return start < end ? current >= start && current < end : current >= start || current < end;
}

class NotificationSkippedError extends Error {}

export class NotificationManager {
  private telegramService: TelegramBotService | null = null;
  private config: NotificationConfig;

  constructor(config: Partial<NotificationConfig> = {}, private readonly profileId?: string) {
    this.config = {
      browserPush: config.browserPush ?? true,
      sms: config.sms ?? false,
      telegram: config.telegram ?? false,
      email: config.email ?? false,
      smsNumber: config.smsNumber,
      telegramChatId: config.telegramChatId,
      telegramBotToken: config.telegramBotToken,
      emailRecipient: config.emailRecipient,
      quietHoursStart: config.quietHoursStart,
      quietHoursEnd: config.quietHoursEnd,
      quietHoursTimeZone: config.quietHoursTimeZone,
      quietHoursDays: config.quietHoursDays,
      emailOverride: config.emailOverride,
      emailFromOverride: config.emailFromOverride,
      smsOverride: config.smsOverride,
    };

    if (this.config.telegram && this.config.telegramBotToken) {
      this.telegramService = new TelegramBotService(this.config.telegramBotToken);
    }
  }

  // ---------------------------------------------------------------------------
  // Notification Sending
  // ---------------------------------------------------------------------------

  /**
   * Send notification through appropriate channels based on severity
   */
  async notify(payload: NotificationPayload, quietHoursChecked = false): Promise<NotificationResult[]> {
    const channels = SEVERITY_CHANNELS[payload.severity] || ['browser'];
    if (!quietHoursChecked && isQuietHours(this.config, payload.severity)) {
      return channels.map(channel => ({ channel, success: false, skipped: true, error: 'Quiet hours' }));
    }
    // Start channels independently so a slow or failed provider cannot hold up another.
    return Promise.all(channels.map(async (channel): Promise<NotificationResult> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let delivered = false;
      try {
        await Promise.race([
          this.sendToChannel(channel, payload, () => { delivered = true; }),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), 15000);
          }),
        ]);
        return { channel, success: true };
      } catch (error) {
        if (error instanceof NotificationSkippedError) {
          console.warn(`[NotificationManager] ${channel} channel skipped: ${error.message}`);
          return { channel, success: false, skipped: true, error: error.message };
        }
        if (error instanceof Error && error.name === 'EmailSuppressedError') {
          console.warn(`[NotificationManager] ${channel} channel skipped: the recipient unsubscribed from this mail`);
          return { channel, success: false, skipped: true, error: error.message };
        }
        console.error(`[NotificationManager] ${channel} channel failed: delivery failed`);
        return {
          channel,
          success: false,
          ...(delivered ? { delivered: true } : {}),
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      } finally {
        clearTimeout(timer);
      }
    }));
  }

  /**
   * Send notification to specific channel
   */
  private async sendToChannel(
    channel: string,
    payload: NotificationPayload,
    onDelivered: () => void
  ): Promise<void> {
    switch (channel) {
      case 'browser':
        await this.sendBrowserPush(payload, onDelivered);
        break;
      case 'telegram':
        await this.sendTelegram(payload, onDelivered);
        break;
      case 'sms':
        await this.sendSms(payload);
        onDelivered();
        break;
      case 'email':
        await this.sendEmail(payload);
        onDelivered();
        break;
      default:
        console.warn(`Unknown notification channel: ${channel}`);
    }
  }

  /**
   * Send email alert via Resend.
   *
   * Fires only when:
   *  1. `email` flag is true (user opted in)
   *  2. `emailRecipient` is set (we know where to send)
   *  3. Either a server `RESEND_API_KEY` exists OR the user has supplied
   *     `emailOverride.apiKey` (BYO key path).
   *
   * Server credentials require an operator owner.
   * A recipient who unsubscribed gets nothing; `notify` reports the channel
   * as skipped.
   */
  private async sendEmail(payload: NotificationPayload): Promise<void> {
    if (!this.config.email || !this.config.emailRecipient) throw new NotificationSkippedError('email is disabled or has no recipient');

    const hasUserKey = !!this.config.emailOverride?.apiKey;
    if (hasUserKey && !this.config.emailFromOverride?.trim() &&
        !this.config.emailOverride?.from?.trim() && !isResendConfigured()) {
      throw new NotificationSkippedError('personal mail requires a sender or complete server mail configuration');
    }
    if (!hasUserKey && !isResendConfigured()) {
      throw new NotificationSkippedError('email is not configured');
    }

    if (!hasUserKey) {
      const owner = this.profileId
        ? await (await getSafeOSDatabase()).get<{ role: string }>('SELECT role FROM user_profiles WHERE id = ?', [this.profileId])
        : undefined;
      if (owner?.role !== 'operator') {
        throw new NotificationSkippedError('server mail requires an operator owner');
      }
    }

    await sendAlertEmail(
      this.config.emailRecipient,
      payload.severity,
      payload.title,
      payload.message,
      {
        override: this.config.emailOverride,
        fromOverride: this.config.emailFromOverride,
        streamId: payload.streamId,
        alertId: payload.alertId,
        thumbnailUrl: payload.thumbnailUrl,
        timestamp: payload.timestamp,
      },
    );
  }

  /**
   * Send browser push notifications
   */
  private async sendBrowserPush(payload: NotificationPayload, onDelivered: () => void): Promise<void> {
    if (!this.config.browserPush) throw new NotificationSkippedError('browser push is disabled');

    const subscriptions = await getPushSubscriptions(this.profileId);

    if (subscriptions.size === 0) throw new NotificationSkippedError('no browser subscriptions');
    let delivered = false;
    await Promise.all(Array.from(subscriptions.values()).map(async subscription => {
      try {
        await sendBrowserPushNotification(subscription, {
          title: payload.title,
          body: payload.message,
          icon: '/icons/alert.png',
          badge: '/icons/badge.png',
          data: {
            streamId: payload.streamId,
            alertId: payload.alertId,
            severity: payload.severity,
          },
        });
        delivered = true;
        onDelivered();
      } catch {
        console.warn('[NotificationManager] browser channel skipped: destination rejected or delivery failed');
      }
    }));
    if (!delivered) throw new Error('No browser destination accepted delivery');
  }

  /**
   * Send Telegram notifications
   */
  private async sendTelegram(payload: NotificationPayload, onDelivered: () => void): Promise<void> {
    if (!this.config.telegram) throw new NotificationSkippedError('telegram is disabled');
    if (!this.config.telegramBotToken || !this.telegramService) {
      throw new NotificationSkippedError('recipient verification is unavailable for the server bot');
    }

    const chatIds = await getTelegramChatIds(this.profileId);

    if (chatIds.size === 0) throw new NotificationSkippedError('no telegram destinations');
    let delivered = false;
    await Promise.all(Array.from(chatIds).map(async chatId => {
      try {
        await this.telegramService!.sendAlert(chatId, payload);
        delivered = true;
        onDelivered();
      } catch {
        console.warn('[NotificationManager] telegram channel skipped: delivery failed');
      }
    }));
    if (!delivered) throw new Error('No telegram destination accepted delivery');
  }

  /**
   * Send SMS notifications.
   *
   * Fires only when:
   *  1. `sms` flag is true (user opted in)
   *  2. `smsNumber` is set (we know where to send)
   *  3. Either server `TWILIO_*` env is configured OR the user has supplied a
   *     complete `smsOverride` (BYO Twilio path).
   *  4. Server credentials require a verified phone belonging to the alert owner.
   */
  private async sendSms(payload: NotificationPayload): Promise<void> {
    if (!this.config.sms || !this.config.smsNumber) throw new NotificationSkippedError('sms is disabled or has no recipient');

    const override = this.config.smsOverride;
    const hasCompleteOverride = !!(
      override?.accountSid &&
      override?.authToken &&
      override?.fromNumber
    );
    if (!hasCompleteOverride && !isTwilioConfigured()) {
      throw new NotificationSkippedError('no Twilio credentials configured');
    }

    if (!hasCompleteOverride) {
      const verified = this.profileId ? await (await getSafeOSDatabase()).get(
        'SELECT id FROM phone_numbers WHERE profile_id = ? AND phone_number = ? AND verified = 1',
        [this.profileId, this.config.smsNumber]
      ) : undefined;
      if (!verified) {
        throw new NotificationSkippedError('recipient is not verified for the alert owner');
      }
    }

    // Delegate formatting + encoding-aware truncation to sendAlertSms so we
    // don't duplicate the "[SafeOS …]" tag template here and so long messages
    // get trimmed before they hit Twilio (155 char single-segment limit, or
    // ~67 for UCS-2 content).
    await sendAlertSms(
      this.config.smsNumber,
      payload.severity,
      payload.title,
      payload.message,
      { override: hasCompleteOverride ? override : undefined },
    );
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Update notification configuration
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };

    this.telegramService = this.config.telegram && this.config.telegramBotToken
      ? new TelegramBotService(this.config.telegramBotToken) : null;
  }

  /**
   * Get current configuration
   */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  /**
   * Check which channels are available
   */
  getAvailableChannels(): string[] {
    const channels: string[] = ['browser'];

    if (process.env['TWILIO_ACCOUNT_SID']) {
      channels.push('sms');
    }

    if (process.env['TELEGRAM_BOT_TOKEN']) {
      channels.push('telegram');
    }

    if (isResendConfigured()) {
      channels.push('email');
    }

    return channels;
  }
}

// Singleton instance
let notificationManager: NotificationManager | null = null;

export function getNotificationManager(): NotificationManager {
  if (!notificationManager) {
    notificationManager = new NotificationManager();
  }
  return notificationManager;
}

export default NotificationManager;
