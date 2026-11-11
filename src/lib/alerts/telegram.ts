/**
 * Telegram Bot Service
 *
 * Send alerts via Telegram.
 *
 * @module lib/alerts/telegram
 */

import TelegramBot from 'node-telegram-bot-api';

// =============================================================================
// Types
// =============================================================================

interface AlertPayload {
  severity: string;
  title: string;
  message: string;
  streamId: string;
  thumbnailUrl?: string;
}

// =============================================================================
// TelegramBotService Class
// =============================================================================

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private registeredChats: Set<string> = new Set();

  constructor(token = process.env['TELEGRAM_BOT_TOKEN']) {
    if (token) {
      this.bot = new TelegramBot(token, { polling: false });
      console.log('Telegram bot initialized');
    }
  }

  /**
   * Send alert message
   */
  async sendAlert(chatId: string, payload: AlertPayload): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    const emoji = this.getSeverityEmoji(payload.severity);
    const message = this.formatMessage(emoji, payload);

    if (payload.thumbnailUrl) {
      await this.bot.sendPhoto(chatId, payload.thumbnailUrl, {
        caption: message,
        parse_mode: 'Markdown',
      });
    } else {
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
    }
  }

  /**
   * Send text message
   */
  async sendMessage(chatId: string, message: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
    });
  }

  /**
   * Send photo with caption
   */
  async sendPhoto(
    chatId: string,
    photoUrl: string,
    caption?: string
  ): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    await this.bot.sendPhoto(chatId, photoUrl, {
      caption,
      parse_mode: 'Markdown',
    });
  }

  /**
   * Register a chat ID for notifications
   */
  registerChat(chatId: string): void {
    this.registeredChats.add(chatId);
  }

  /**
   * Unregister a chat ID
   */
  unregisterChat(chatId: string): void {
    this.registeredChats.delete(chatId);
  }

  /**
   * Get registered chat IDs
   */
  getRegisteredChats(): string[] {
    return Array.from(this.registeredChats);
  }

  /**
   * Broadcast to all registered chats
   */
  async broadcast(payload: AlertPayload): Promise<void> {
    for (const chatId of this.registeredChats) {
      try {
        await this.sendAlert(chatId, payload);
      } catch (error) {
        console.error(`Failed to send to ${chatId}:`, error);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🆘';
      case 'high':
        return '🚨';
      case 'medium':
        return '⚠️';
      case 'low':
        return '📢';
      case 'info':
        return 'ℹ️';
      default:
        return '🔔';
    }
  }

  private formatMessage(emoji: string, payload: AlertPayload): string {
    return `${emoji} *SafeOS Guardian Alert*

*Severity:* ${payload.severity.toUpperCase()}
*Title:* ${payload.title}

${payload.message}

_Stream: ${payload.streamId.slice(0, 8)}..._`;
  }
}

export default TelegramBotService;
