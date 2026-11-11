/**
 * Zod Schemas
 *
 * Validation schemas for all API endpoints.
 *
 * @module api/schemas
 */

import { z } from 'zod';

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Standard ID parameter schema
 */
export const IdParamsSchema = z.object({
  id: z.string().min(1),
});

/**
 * Pagination query schema
 */
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// =============================================================================
// Stream Schemas
// =============================================================================

export const ScenarioEnum = z.enum(['pet', 'baby', 'elderly']);

export const StreamStatusEnum = z.enum(['active', 'paused', 'ended', 'banned']);

export const CreateStreamSchema = z.object({
  scenario: ScenarioEnum,
});

export const UpdateStreamSchema = z.object({
  status: StreamStatusEnum.optional(),
});

export const ListStreamsQuerySchema = PaginationSchema.extend({
  status: StreamStatusEnum.optional(),
});

// =============================================================================
// Alert Schemas
// =============================================================================

export const SeverityEnum = z.enum(['info', 'low', 'medium', 'high', 'critical']);

export const ListAlertsQuerySchema = PaginationSchema.extend({
  streamId: z.string().optional(),
  acknowledged: z.enum(['true', 'false']).optional(),
  severity: SeverityEnum.optional(),
});

export const AcknowledgeAllAlertsSchema = z.object({
  streamId: z.string().optional(),
});

export const AlertSummaryQuerySchema = z.object({
  streamId: z.string().optional(),
  since: z.string().datetime().optional(),
});

// =============================================================================
// Profile Schemas
// =============================================================================

export const CreateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  scenario: ScenarioEnum,
  settings: z.record(z.any()).optional(),
});

export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scenario: ScenarioEnum.optional(),
  settings: z.record(z.any()).optional(),
});

export const ListProfilesQuerySchema = z.object({
  scenario: ScenarioEnum.optional(),
});

// =============================================================================
// Auth Schemas
// =============================================================================

export const CreateSessionSchema = z.object({
  deviceId: z.string().optional(),
  displayName: z.string().min(1).max(100).optional(),
});

export const UpdateUserProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  preferences: z
    .object({
      defaultScenario: ScenarioEnum.optional(),
      motionSensitivity: z.number().min(0).max(1).optional(),
      audioSensitivity: z.number().min(0).max(1).optional(),
      alertVolume: z.number().min(0).max(1).optional(),
      theme: z.enum(['dark', 'light']).optional(),
    })
    .optional(),
  notificationSettings: z
    .object({
      browserPush: z.boolean().optional(),
      sms: z.boolean().optional(),
      telegram: z.boolean().optional(),
      emailDigest: z.boolean().optional(),
      email: z.boolean().optional(),
      emailRecipient: z.string().email().optional(),
      emailOverride: z.object({ apiKey: z.string().max(4096).optional(), replyTo: z.string().email().optional() }).optional(),
      emailFromOverride: z.string().max(320).optional(),
      smsOverride: z.object({
        accountSid: z.string().max(256).optional(),
        authToken: z.string().max(4096).optional(),
        fromNumber: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
      }).optional(),
      telegramBotToken: z.string().max(4096).optional(),
      smsNumber: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
      quietHoursStart: z.string().nullable().optional(),
      quietHoursEnd: z.string().nullable().optional(),
    })
    .optional(),
});

// =============================================================================
// Webhook Schemas
// =============================================================================

export const WebhookEventEnum = z.enum([
  'alert.created',
  'alert.acknowledged',
  'stream.started',
  'stream.ended',
  'analysis.completed',
  'review.required',
]);

export const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(WebhookEventEnum).min(1),
  secret: z.string().min(16).optional(),
});

export const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(WebhookEventEnum).min(1).optional(),
  enabled: z.boolean().optional(),
});

// =============================================================================
// Notification Schemas
// =============================================================================

export const PushSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  userId: z.string().optional(),
});

export const TelegramConfigSchema = z.object({
  chatId: z.string().min(1).regex(/^\d+$/, 'Chat ID must be numeric'),
});

export const SmsConfigSchema = z.object({
  phoneNumber: z.string().min(10).max(15).regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number'),
});

export const UnsubscribeSchema = z.object({
  userId: z.string().min(1).optional(),
});

export const TelegramUnregisterSchema = z.object({
  chatId: z.string().min(1).regex(/^\d+$/, 'Chat ID must be numeric').optional(),
});

export const TestNotificationSchema = z.object({
  channel: z.enum(['push', 'telegram', 'sms', 'email']),
  target: z.string().min(1).optional(),
});

// =============================================================================
// Review Schemas
// =============================================================================

export const ReviewActionEnum = z.enum(['approved', 'rejected', 'escalated', 'banned']);

export const ReviewActionSchema = z.object({
  action: ReviewActionEnum,
  notes: z.string().max(1000).optional(),
});

export const ListFlagsQuerySchema = PaginationSchema.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'escalated', 'banned']).optional(),
  tier: z.coerce.number().int().min(0).max(3).optional(),
});

export const ReviewQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// =============================================================================
// Analysis Schemas
// =============================================================================

export const ConcernLevelEnum = z.enum(['none', 'low', 'medium', 'high', 'critical']);

export const ListAnalysisQuerySchema = PaginationSchema.extend({
  streamId: z.string().optional(),
  concernLevel: ConcernLevelEnum.optional(),
});

export const AnalysisStatsQuerySchema = z.object({
  streamId: z.string().optional(),
  since: z.string().datetime().optional(),
});

// =============================================================================
// Export Schemas
// =============================================================================

export const ExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).optional().default('json'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  streamId: z.string().optional(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type CreateStream = z.infer<typeof CreateStreamSchema>;
export type UpdateStream = z.infer<typeof UpdateStreamSchema>;
export type CreateProfile = z.infer<typeof CreateProfileSchema>;
export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type UpdateUserProfile = z.infer<typeof UpdateUserProfileSchema>;
export type CreateWebhook = z.infer<typeof CreateWebhookSchema>;
export type UpdateWebhook = z.infer<typeof UpdateWebhookSchema>;
export type PushSubscription = z.infer<typeof PushSubscriptionSchema>;
export type TelegramConfig = z.infer<typeof TelegramConfigSchema>;
export type SmsConfig = z.infer<typeof SmsConfigSchema>;
export type ReviewAction = z.infer<typeof ReviewActionSchema>;
