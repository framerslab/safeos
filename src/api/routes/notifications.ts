/**
 * Notification Routes
 *
 * API routes for notification management.
 *
 * @module api/routes/notifications
 */

import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate.js';
import {
  PushSubscriptionSchema,
  TelegramConfigSchema,
  UnsubscribeSchema,
  TelegramUnregisterSchema,
  TestNotificationSchema,
} from '../schemas/index.js';
import { sendTestEmail, isResendConfigured, isMailLinkConfigured } from '../../lib/alerts/email.js';
import { sendTestSms, isTwilioConfigured } from '../../lib/alerts/twilio.js';
import { strictLimiter } from '../middleware/rate-limiter.js';

// =============================================================================
// Router
// =============================================================================

export const notificationRoutes = Router();

// In-memory storage for subscriptions (would use DB in production)
const pushSubscriptions: Map<string, any> = new Map();
const telegramChatIds: Set<string> = new Set();

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/notifications/subscribe - Subscribe to browser push
 */
notificationRoutes.post('/subscribe', validate(PushSubscriptionSchema), async (req: Request, res: Response) => {
  try {
    const { subscription, userId } = req.body;

    const id = userId || `user-${Date.now()}`;
    pushSubscriptions.set(id, subscription);

    res.json({ success: true, id });
  } catch (error) {
    console.error('Failed to subscribe:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

/**
 * DELETE /api/notifications/subscribe - Unsubscribe from browser push
 */
notificationRoutes.delete('/subscribe', validate(UnsubscribeSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (userId) {
      pushSubscriptions.delete(userId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to unsubscribe:', error);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

/**
 * POST /api/notifications/telegram/register - Register Telegram chat ID
 */
notificationRoutes.post('/telegram/register', validate(TelegramConfigSchema), async (req: Request, res: Response) => {
  try {
    const { chatId } = req.body;

    telegramChatIds.add(chatId);

    res.json({ success: true, chatId });
  } catch (error) {
    console.error('Failed to register Telegram:', error);
    res.status(500).json({ error: 'Failed to register Telegram' });
  }
});

/**
 * DELETE /api/notifications/telegram/register - Unregister Telegram chat ID
 */
notificationRoutes.delete('/telegram/register', validate(TelegramUnregisterSchema), async (req: Request, res: Response) => {
  try {
    const { chatId } = req.body;

    if (chatId) {
      telegramChatIds.delete(chatId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to unregister Telegram:', error);
    res.status(500).json({ error: 'Failed to unregister Telegram' });
  }
});

/**
 * GET /api/notifications/status - Report which server-side notification
 * channels are configured. UI uses this to show "configured: yes/no" rows.
 */
notificationRoutes.get('/status', async (_req: Request, res: Response) => {
  try {
    res.json({
      status: {
        pushSubscriptions: pushSubscriptions.size,
        telegramChats: telegramChatIds.size,
        smsEnabled: !!process.env['TWILIO_ACCOUNT_SID'],
        telegramEnabled: !!process.env['TELEGRAM_BOT_TOKEN'],
        emailEnabled: isResendConfigured(),
      },
    });
  } catch (error) {
    console.error('Failed to get notification status:', error);
    res.status(500).json({ error: 'Failed to get notification status' });
  }
});

/**
 * POST /api/notifications/test - Send test notification (channel-agnostic stub).
 */
notificationRoutes.post('/test', validate(TestNotificationSchema), async (req: Request, res: Response) => {
  try {
    const { channel, target } = req.body;

    const testMessage = 'This is a test notification from SafeOS Guardian';

    res.json({
      success: true,
      message: `Test notification sent via ${channel}`,
      target,
      content: testMessage,
    });
  } catch (error) {
    console.error('Failed to send test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

/**
 * POST /api/notifications/test-email - Send a real Resend email to verify
 * the user's email configuration. Accepts an optional BYO Resend key + From
 * override; falls back to server `RESEND_API_KEY` and `EMAIL_FROM`.
 *
 * Body:
 *   { to: string,                    // recipient
 *     resendApiKey?: string,         // optional BYO key
 *     fromOverride?: string,         // optional sender override (must be a
 *                                    // domain verified in your Resend account)
 *     replyTo?: string }
 */
/**
 * POST /api/notifications/test-sms - Send a real Twilio test SMS so the user
 * can verify their phone number + credentials work. Accepts optional BYO
 * Twilio creds; falls back to server `TWILIO_*` env vars.
 *
 * Body:
 *   { to: string,                       // recipient phone (E.164: +15551234567)
 *     twilioAccountSid?: string,        // optional BYO
 *     twilioAuthToken?: string,         // optional BYO
 *     twilioFromNumber?: string }       // optional BYO (must be a Twilio-owned number)
 */
notificationRoutes.post('/test-sms', strictLimiter, async (req: Request, res: Response) => {
  try {
    const { to, twilioAccountSid, twilioAuthToken, twilioFromNumber } = req.body ?? {};

    if (!to || typeof to !== 'string') {
      return res.status(400).json({ error: 'Recipient phone number is required' });
    }
    // E.164 sanity check — block obvious garbage before hitting Twilio.
    if (!/^\+[1-9]\d{6,14}$/.test(to.trim())) {
      return res.status(400).json({
        error: 'Invalid phone number',
        message: 'Use E.164 format with a leading + and country code (e.g. +15551234567).',
      });
    }

    const overrideProvided = !!(twilioAccountSid && twilioAuthToken && twilioFromNumber);
    if (!overrideProvided && !isTwilioConfigured()) {
      return res.status(400).json({
        error: 'Twilio not configured',
        message:
          'No Twilio credentials were supplied and the server has no TWILIO_* env vars set. Add credentials in Settings → Notifications or configure them on the server.',
      });
    }

    const override = overrideProvided
      ? {
          accountSid: String(twilioAccountSid),
          authToken: String(twilioAuthToken),
          fromNumber: String(twilioFromNumber),
        }
      : undefined;

    const result = await sendTestSms(to.trim(), { override });

    return res.json({
      success: true,
      sid: result.sid,
      to: result.to,
      from: result.from,
    });
  } catch (error) {
    // Log the full error server-side but never echo Twilio internals (account
    // SIDs, error codes, raw messages) back to the client — they could leak
    // configuration details or enumerate valid endpoints.
    console.error('[/test-sms] send failed:', error);
    return res.status(500).json({
      error: 'Failed to send test SMS',
      message: 'The SMS could not be delivered. Double-check the recipient number and your Twilio credentials, then try again.',
    });
  }
});

notificationRoutes.post('/test-email', strictLimiter, async (req: Request, res: Response) => {
  try {
    const { to, resendApiKey, fromOverride, replyTo } = req.body ?? {};

    if (!to || typeof to !== 'string') {
      return res.status(400).json({ error: 'Recipient email is required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      return res.status(400).json({
        error: 'Invalid recipient',
        message: 'That doesn’t look like a valid email address.',
      });
    }

    // Every mail carries an unsubscribe link back to this server, so nothing
    // is sent until the server knows its own https address.
    if (!isMailLinkConfigured()) {
      return res.status(400).json({
        error: 'Email not configured',
        message:
          'Every email carries an unsubscribe link to this server. Set SAFEOS_API_PUBLIC_URL to its https address (or SAFEOS_DOMAIN behind the bundled Caddy), then try again.',
      });
    }

    // Reject if neither server nor user has a key set — saves a confusing
    // 500 from the Resend SDK.
    if (!resendApiKey && !isResendConfigured()) {
      return res.status(400).json({
        error: 'Email not configured',
        message:
          'No Resend API key was supplied and the server has no RESEND_API_KEY set. Add a key in Settings → Notifications or set one on the server.',
      });
    }

    const override = resendApiKey
      ? { apiKey: String(resendApiKey), ...(replyTo ? { replyTo: String(replyTo) } : {}) }
      : undefined;

    const result = await sendTestEmail(to.trim(), {
      override,
      fromOverride: typeof fromOverride === 'string' && fromOverride ? fromOverride : undefined,
    });

    return res.json({
      success: true,
      messageId: result.id,
      to: result.to,
      from: result.from,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'EmailSuppressedError') {
      return res.status(409).json({
        error: 'Address unsubscribed',
        message:
          'This address unsubscribed from SafeOS Guardian alert email, so no test was sent.',
      });
    }
    // Log full server-side, sanitize the client response so we don't leak
    // Resend internals (raw error keys, account context) into a 500 body.
    console.error('[/test-email] send failed:', error);
    return res.status(500).json({
      error: 'Failed to send test email',
      message: 'The email could not be delivered. Double-check the recipient address and your Resend credentials, then try again.',
    });
  }
});

// Export subscriptions for use by notification manager
export function getPushSubscriptions(): Map<string, any> {
  return pushSubscriptions;
}

export function getTelegramChatIds(): Set<string> {
  return telegramChatIds;
}

export default notificationRoutes;
