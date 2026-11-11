/**
 * SafeOS Package Index
 *
 * Main entry point for the SafeOS package.
 *
 * @module safeos
 */

// =============================================================================
// Types
// =============================================================================

export * from './types';

// =============================================================================
// Database
// =============================================================================

export {
  createSafeOSDatabase,
  getSafeOSDatabase,
  runMigrations,
  cleanupOldFrames,
  generateId,
  now,
  closeDatabase,
} from './db';

// =============================================================================
// API Server
// =============================================================================

export { SafeOSServer } from './api/server';

// =============================================================================
// Queues
// =============================================================================

export { AnalysisQueue } from './queues/analysis-queue';

// =============================================================================
// Ollama Client
// =============================================================================

export { OllamaClient } from './lib/ollama/client';

// =============================================================================
// Analysis
// =============================================================================

export { cloudFallbackAnalysis, getAvailableProviders } from './lib/analysis/cloud-fallback';

// =============================================================================
// Alerts
// =============================================================================

export {
  AlertEscalationManager,
  getEscalationManager,
  ESCALATION_LEVELS,
} from './lib/alerts/escalation';

export { NotificationManager, getNotificationManager } from './lib/alerts/notification-manager';

export {
  sendEmail,
  sendAlertEmail,
  isResendConfigured,
  isMailLinkConfigured,
  EmailNotConfiguredError,
  EmailSendError,
  EmailSuppressedError,
} from './lib/alerts/email';

export {
  MailSuppressionStore,
  getMailSuppressionStore,
  setMailSuppressionStore,
  suppressAddressesFromText,
  resubscribeAddressesFromText,
} from './lib/alerts/mail-suppression';

export { MAIL_KINDS, type MailKind, type MailCategory, type SuppressionScope } from './lib/alerts/mail-kinds';

export { TelegramBotService } from './lib/alerts/telegram';

export { sendTwilioSms, isTwilioConfigured } from './lib/alerts/twilio';

export {
  sendBrowserPushNotification,
  isVapidConfigured,
} from './lib/alerts/browser-push';

// =============================================================================
// Safety
// =============================================================================

export { ContentFilter } from './lib/safety/content-filter';

export {
  CRITICAL_DISCLAIMER,
  BABY_MONITORING_DISCLAIMER,
  ELDERLY_MONITORING_DISCLAIMER,
  PET_MONITORING_DISCLAIMER,
  ACKNOWLEDGMENT_TEXT,
  getScenarioDisclaimer,
  getFullDisclaimer,
} from './lib/safety/disclaimers';

// =============================================================================
// Version
// =============================================================================

export const VERSION = '0.1.0';

// =============================================================================
// Auto-start Server when run directly
// =============================================================================

// Check if this file is being run directly
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '') ||
                     process.argv[1]?.endsWith('index.ts');

if (isMainModule) {
  import('./api/server.js').then(({ SafeOSServer }) => {
    const server = new SafeOSServer();
    server.start().catch((err: Error) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await server.stop();
      process.exit(0);
    });
  });
}
