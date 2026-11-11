/**
 * Twilio SMS Service
 *
 * Send SMS alerts via Twilio. Falls back to server-level env vars
 * (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER) if no
 * per-user override is supplied — mirrors the BYO pattern used for Resend
 * in src/lib/alerts/email.ts.
 *
 * @module lib/alerts/twilio
 */

import twilio from 'twilio';

// =============================================================================
// Types
// =============================================================================

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface SendSmsOptions {
  /** Override server-level Twilio config (e.g. user supplied their own creds). */
  override?: Partial<TwilioConfig>;
}

// =============================================================================
// Server-level config (fallback)
// =============================================================================

function getServerConfig(): TwilioConfig | null {
  const accountSid = process.env['TWILIO_ACCOUNT_SID'];
  const authToken = process.env['TWILIO_AUTH_TOKEN'];
  const fromNumber = process.env['TWILIO_PHONE_NUMBER'];
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

/**
 * Whether the server has Twilio creds configured (for /api/notifications/status).
 */
export function isTwilioConfigured(): boolean {
  return getServerConfig() !== null;
}

// =============================================================================
// Client cache — one Twilio client per accountSid+authToken pair
// =============================================================================

const clientCache = new Map<string, twilio.Twilio>();

function getClient(accountSid: string, authToken: string): twilio.Twilio {
  const cacheKey = `${accountSid}:${authToken}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = twilio(accountSid, authToken, { timeout: 15000 });
    clientCache.set(cacheKey, client);
  }
  return client;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Resolve effective Twilio config from optional override + server env.
 * Throws if neither path yields a complete config.
 */
function resolveConfig(override?: Partial<TwilioConfig>): TwilioConfig {
  const server = getServerConfig();
  const config: TwilioConfig = {
    accountSid: override?.accountSid ?? server?.accountSid ?? '',
    authToken: override?.authToken ?? server?.authToken ?? '',
    fromNumber: override?.fromNumber ?? server?.fromNumber ?? '',
  };

  if (!config.accountSid || !config.authToken || !config.fromNumber) {
    throw new TwilioNotConfiguredError(
      'Twilio is not configured. Set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER on the server, or provide an override.',
    );
  }
  return config;
}

/**
 * Send a raw SMS via Twilio.
 */
export async function sendTwilioSms(
  to: string,
  message: string,
  options: SendSmsOptions = {},
): Promise<{ sid: string; to: string; from: string }> {
  const config = resolveConfig(options.override);
  const client = getClient(config.accountSid, config.authToken);

  const result = await client.messages.create({
    body: message,
    from: config.fromNumber,
    to,
  });

  return { sid: result.sid, to, from: config.fromNumber };
}

/**
 * GSM 03.38 default-alphabet character set (incl. the 9 extension-table chars).
 * Anything outside this set forces Twilio to encode the SMS as UCS-2, which
 * has a much smaller per-segment payload — single segment = 70 chars,
 * multipart concatenation overhead = 67 chars/segment.
 *
 * Reference: https://en.wikipedia.org/wiki/GSM_03.38
 */
const GSM7_CHARSET = new Set(
  // Base table (128 chars). Newline + carriage return are valid; tab/escape are control.
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡' +
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà' +
    // Extension table (10 chars; technically 14 escaped sequences but the
    // characters themselves each count as 2 GSM-7 bytes — we still consider
    // them GSM-safe for truncation-length purposes).
    '\f^{}\\[~]|€',
);

function isGsm7(input: string): boolean {
  for (const ch of input) {
    if (!GSM7_CHARSET.has(ch)) return false;
  }
  return true;
}

/**
 * Truncate an alert body to fit a single concatenated-SMS segment without
 * losing the severity tag at the start. GSM-7 gets ~153 chars/segment in a
 * concatenated SMS; UCS-2 gets only ~67 chars/segment. Appends an ellipsis
 * if truncation actually trims content.
 *
 * Exported for tests + reuse.
 */
export function truncateForSms(input: string): string {
  const max = isGsm7(input) ? 153 : 67;
  if (input.length <= max) return input;
  return input.slice(0, Math.max(0, max - 3)) + '...';
}

/**
 * Send a severity-tagged alert SMS, truncated to single concatenated-segment
 * length for the detected encoding.
 */
export async function sendAlertSms(
  to: string,
  severity: string,
  title: string,
  message: string,
  options: SendSmsOptions = {},
): Promise<{ sid: string; to: string; from: string }> {
  const formattedMessage = `[SafeOS ${severity.toUpperCase()}] ${title}: ${message}`;
  return sendTwilioSms(to, truncateForSms(formattedMessage), options);
}

/**
 * Send a one-off test SMS so users can verify their Twilio config works.
 */
export async function sendTestSms(
  to: string,
  options: SendSmsOptions = {},
): Promise<{ sid: string; to: string; from: string }> {
  return sendTwilioSms(
    to,
    'SafeOS Guardian — SMS is working. Real alerts will arrive at high or critical severity.',
    options,
  );
}

// =============================================================================
// Errors
// =============================================================================

export class TwilioNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwilioNotConfiguredError';
  }
}

export default {
  sendTwilioSms,
  sendAlertSms,
  sendTestSms,
  isTwilioConfigured,
  TwilioNotConfiguredError,
};
