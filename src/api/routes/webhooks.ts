/**
 * Webhook Routes
 *
 * Custom webhook integrations for alerts and events.
 *
 * @module api/routes/webhooks
 */

import { Router } from 'express';
import { createHmac, randomBytes } from 'crypto';
import { getSafeOSDatabase, generateId, now } from '../../db/index.js';
import { validate } from '../middleware/validate.js';
import { findLiveSession } from '../middleware/auth.js';
import { CreateWebhookSchema, IdParamsSchema } from '../schemas/index.js';

// =============================================================================
// Types
// =============================================================================

interface Webhook {
  id: string;
  profileId: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  lastTriggered: string | null;
  failureCount: number;
  createdAt: string;
}

interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
  signature?: string;
}

// =============================================================================
// Router
// =============================================================================

export const webhookRouter = Router();

// =============================================================================
// Webhook Management
// =============================================================================

/**
 * GET /api/webhooks
 * List all webhooks for the authenticated user
 */
webhookRouter.get('/', async (req, res) => {
  try {
    const token = req.headers['x-session-token'] as string;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const db = await getSafeOSDatabase();

    // An expired session is refused like an unknown one.
    const session = await findLiveSession(token);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    const webhooks = await db.all<Webhook>(
      `SELECT * FROM webhooks WHERE profile_id = ? ORDER BY created_at DESC`,
      [session.profile_id]
    );

    res.json({
      success: true,
      data: webhooks.map((w) => ({
        ...w,
        secret: '********', // Don't expose secrets
        events: JSON.parse(w.events as unknown as string),
      })),
    });
  } catch (error) {
    console.error('List webhooks error:', error);
    res.status(500).json({ success: false, error: 'Failed to list webhooks' });
  }
});

/**
 * POST /api/webhooks
 * Create a new webhook
 */
webhookRouter.post('/', validate(CreateWebhookSchema), async (req, res) => {
  try {
    const token = req.headers['x-session-token'] as string;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { name, url, events } = req.body;

    const db = await getSafeOSDatabase();

    // An expired session is refused like an unknown one.
    const session = await findLiveSession(token);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    const webhookId = generateId();
    const secret = generateWebhookSecret();

    await db.run(
      `INSERT INTO webhooks (
        id, profile_id, name, url, secret, events, is_active, failure_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)`,
      [webhookId, session.profile_id, name, url, secret, JSON.stringify(events), now()]
    );

    res.status(201).json({
      success: true,
      data: {
        id: webhookId,
        name,
        url,
        secret, // Show secret only on creation
        events,
        isActive: true,
      },
    });
  } catch (error) {
    console.error('Create webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to create webhook' });
  }
});

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook
 */
webhookRouter.delete('/:id', validate(IdParamsSchema, 'params'), async (req, res) => {
  try {
    const token = req.headers['x-session-token'] as string;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const db = await getSafeOSDatabase();

    // An expired session is refused like an unknown one.
    const session = await findLiveSession(token);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    const webhook = await db.get<Webhook>(
      `SELECT * FROM webhooks WHERE id = ? AND profile_id = ?`,
      [id, session.profile_id]
    );

    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    await db.run(`DELETE FROM webhooks WHERE id = ?`, [id]);

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    console.error('Delete webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete webhook' });
  }
});

/**
 * POST /api/webhooks/:id/test
 * Send a test payload to a webhook
 */
webhookRouter.post('/:id/test', validate(IdParamsSchema, 'params'), async (req, res) => {
  try {
    const token = req.headers['x-session-token'] as string;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;
    const db = await getSafeOSDatabase();

    // An expired session is refused like an unknown one.
    const session = await findLiveSession(token);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    const webhook = await db.get<any>(
      `SELECT * FROM webhooks WHERE id = ? AND profile_id = ?`,
      [id, session.profile_id]
    );

    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    // Send test payload
    const testPayload: WebhookPayload = {
      event: 'test',
      timestamp: now(),
      data: {
        message: 'This is a test webhook from SafeOS Guardian',
        webhookId: id,
      },
    };

    const result = await sendWebhook(webhook.url, webhook.secret, testPayload);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test webhook sent successfully',
        statusCode: result.statusCode,
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Webhook failed: ${result.error}`,
        statusCode: result.statusCode,
      });
    }
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to test webhook' });
  }
});

// =============================================================================
// Webhook Delivery
// =============================================================================

/**
 * Send a webhook payload
 */
export async function sendWebhook(
  url: string,
  secret: string,
  payload: WebhookPayload
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const signature = generateSignature(JSON.stringify(payload), secret);
    payload.signature = signature;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SafeOS-Signature': signature,
        'X-SafeOS-Event': payload.event,
        'User-Agent': 'SafeOS-Guardian/1.0',
      },
      body: JSON.stringify(payload),
    });

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Trigger webhooks for an event
 */
export async function triggerWebhooks(
  profileId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const db = await getSafeOSDatabase();

  const webhooks = await db.all<any>(
    `SELECT * FROM webhooks WHERE profile_id = ? AND is_active = 1`,
    [profileId]
  );

  const payload: WebhookPayload = {
    event,
    timestamp: now(),
    data,
  };

  for (const webhook of webhooks) {
    const events = JSON.parse(webhook.events);
    if (!events.includes(event)) continue;

    const result = await sendWebhook(webhook.url, webhook.secret, payload);

    // Update webhook status
    if (result.success) {
      await db.run(
        `UPDATE webhooks SET last_triggered = ?, failure_count = 0 WHERE id = ?`,
        [now(), webhook.id]
      );
    } else {
      await db.run(
        `UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?`,
        [webhook.id]
      );

      // Disable after 10 consecutive failures
      if (webhook.failure_count >= 9) {
        await db.run(
          `UPDATE webhooks SET is_active = 0 WHERE id = ?`,
          [webhook.id]
        );
      }
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function generateWebhookSecret(): string {
  // Use cryptographically secure random bytes
  return `whsec_${randomBytes(32).toString('hex')}`;
}

function generateSignature(payload: string, secret: string): string {
  // HMAC-SHA256 signature for secure webhook verification
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `sha256=${signature}`;
}





























