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
  async notify(payload: NotificationPayload): Promise<NotificationResult[]> {
    const channels = SEVERITY_CHANNELS[payload.severity] || ['browser'];
    // Start channels independently so a slow or failed provider cannot hold up another.
    return Promise.all(channels.map(async (channel): Promise<NotificationResult> => {
      try {
        await this.sendToChannel(channel, payload);
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
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }));
  }

  /**
   * Send notification to specific channel
   */
  private async sendToChannel(
    channel: string,
    payload: NotificationPayload
  ): Promise<void> {
    switch (channel) {
      case 'browser':
        await this.sendBrowserPush(payload);
        break;
      case 'telegram':
        await this.sendTelegram(payload);
        break;
      case 'sms':
        await this.sendSms(payload);
        break;
      case 'email':
        await this.sendEmail(payload);
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
    if (!this.config.email || !this.config.emailRecipient) return;

    const hasUserKey = !!this.config.emailOverride?.apiKey;
    if (!hasUserKey && !isResendConfigured()) {
      console.warn('[NotificationManager] email channel skipped: email is not configured (RESEND_API_KEY, EMAIL_FROM and an https SAFEOS_API_PUBLIC_URL)');
      return;
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
  private async sendBrowserPush(payload: NotificationPayload): Promise<void> {
    if (!this.config.browserPush) return;

    const subscriptions = await getPushSubscriptions(this.profileId);

    for (const subscription of subscriptions.values()) {
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
      } catch {
        console.warn('[NotificationManager] browser channel skipped: destination rejected or delivery failed');
      }
    }
  }

  /**
   * Send Telegram notifications
   */
  private async sendTelegram(payload: NotificationPayload): Promise<void> {
    if (!this.config.telegram) return;
    if (!this.config.telegramBotToken || !this.telegramService) {
      throw new NotificationSkippedError('recipient verification is unavailable for the server bot');
    }

    const chatIds = await getTelegramChatIds(this.profileId);

    for (const chatId of chatIds) {
      try {
        await this.telegramService.sendAlert(chatId, payload);
      } catch {
        console.warn('[NotificationManager] telegram channel skipped: delivery failed');
      }
    }
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
    if (!this.config.sms || !this.config.smsNumber) return;

    const override = this.config.smsOverride;
    const hasCompleteOverride = !!(
      override?.accountSid &&
      override?.authToken &&
      override?.fromNumber
    );
    if (!hasCompleteOverride && !isTwilioConfigured()) {
      console.warn('[NotificationManager] sms channel skipped: no Twilio credentials configured');
      return;
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
