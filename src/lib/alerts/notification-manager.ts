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
  /** True when nothing was sent because the recipient turned this mail off. */
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

export class NotificationManager {
  private telegramService: TelegramBotService | null = null;
  private config: NotificationConfig;

  constructor(config: Partial<NotificationConfig> = {}) {
    this.config = {
      browserPush: config.browserPush ?? true,
      sms: config.sms ?? false,
      telegram: config.telegram ?? false,
      email: config.email ?? false,
      smsNumber: config.smsNumber,
      telegramChatId: config.telegramChatId,
      emailRecipient: config.emailRecipient,
      emailOverride: config.emailOverride,
      emailFromOverride: config.emailFromOverride,
      smsOverride: config.smsOverride,
    };

    if (this.config.telegram && process.env['TELEGRAM_BOT_TOKEN']) {
      this.telegramService = new TelegramBotService();
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
    const results: NotificationResult[] = [];

    for (const channel of channels) {
      try {
        await this.sendToChannel(channel, payload);
        results.push({ channel, success: true });
      } catch (error) {
        if (error instanceof Error && error.name === 'EmailSuppressedError') {
          console.warn(`[NotificationManager] ${channel} channel skipped: the recipient unsubscribed from this mail`);
          results.push({ channel, success: false, skipped: true, error: error.message });
          continue;
        }
        console.error(`Failed to send ${channel} notification:`, error);
        results.push({
          channel,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
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

    const subscriptions = getPushSubscriptions();

    for (const [userId, subscription] of subscriptions) {
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
      } catch (error) {
        console.error(`Failed to send push to ${userId}:`, error);
      }
    }
  }

  /**
   * Send Telegram notifications
   */
  private async sendTelegram(payload: NotificationPayload): Promise<void> {
    if (!this.config.telegram || !this.telegramService) return;

    const chatIds = getTelegramChatIds();

    for (const chatId of chatIds) {
      try {
        await this.telegramService.sendAlert(chatId, payload);
      } catch (error) {
        console.error(`Failed to send Telegram to ${chatId}:`, error);
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

    // Delegate formatting + encoding-aware truncation to sendAlertSms so we
    // don't duplicate the "[SafeOS …]" tag template here and so long messages
    // get trimmed before they hit Twilio (155 char single-segment limit, or
    // ~67 for UCS-2 content).
    await sendAlertSms(
      this.config.smsNumber,
      payload.severity,
      payload.title,
      payload.message,
      { override },
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

    if (this.config.telegram && !this.telegramService && process.env['TELEGRAM_BOT_TOKEN']) {
      this.telegramService = new TelegramBotService();
    }
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
