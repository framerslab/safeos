/**
 * Resend Email Service
 *
 * Send transactional + alert email via Resend. Falls back to server-level
 * env vars if no per-user override is supplied.
 *
 * Every mail carries an unsubscribe path: a visible Unsubscribe link in the
 * footer, `List-Unsubscribe` with an https URL on this server, and
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). The link is
 * bound to its recipient, so a mail goes to one recipient at a time, and the
 * suppression list is read before every send.
 *
 * @module lib/alerts/email
 */

import { Resend } from 'resend';
import { MAIL_KINDS, isMailKind, type MailKind } from './mail-kinds.js';
import { getMailSuppressionStore } from './mail-suppression.js';

// =============================================================================
// Types
// =============================================================================

export interface EmailConfig {
  apiKey: string;
  from: string;
  replyTo?: string;
}

export interface SendEmailOptions {
  /** What this mail is; decides its unsubscribe category and footer line. */
  kind: MailKind;
  /** Override server-level Resend config (e.g. user supplied their own key). */
  override?: Partial<EmailConfig>;
  to: string | string[];
  subject: string;
  /** HTML body. Plain-text fallback is auto-generated if `text` is omitted. */
  html: string;
  text?: string;
  /** Override the From address for this send (e.g. per-user sender). */
  fromOverride?: string;
  /** Severity tag for tracing (`info|low|medium|high|critical`). */
  severity?: string;
  /** Idempotency key — Resend deduplicates within 24h. */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  /** Message id of the first mail sent. */
  id: string;
  /** Message ids, one per recipient that was sent to. */
  ids: string[];
  /** The recipients that were sent to (suppressed addresses are left out). */
  to: string | string[];
  from: string;
}

// =============================================================================
// Server-level config (fallback)
// =============================================================================

function getServerConfig(): EmailConfig | null {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['EMAIL_FROM'];
  const replyTo = process.env['EMAIL_REPLY_TO'];

  if (!apiKey || !from) return null;
  return { apiKey, from, replyTo };
}

const CADDY_PLACEHOLDER_DOMAIN = 'safeos-api.yourdomain.com';

/**
 * The https origin of this API server, which every unsubscribe link points at.
 *
 * `SAFEOS_API_PUBLIC_URL` wins; otherwise the domain the bundled Caddy serves
 * the API on (`SAFEOS_DOMAIN`). Returns null when neither gives an https
 * address: one-click unsubscribe needs https (RFC 8058, section 3.1), so no
 * mail is sent until one is set.
 */
export function getMailLinkBase(): string | null {
  const explicit = process.env['SAFEOS_API_PUBLIC_URL']?.trim();
  if (explicit) {
    const match = explicit.match(/^https:\/\/([^\s/?#:]+)(:\d+)?(\/[^\s?#]*)?$/i);
    if (!match || match[1].toLowerCase() === CADDY_PLACEHOLDER_DOMAIN) return null;
    return explicit.replace(/\/+$/, '');
  }
  const domain = process.env['SAFEOS_DOMAIN']?.trim();
  if (
    domain &&
    domain.toLowerCase() !== CADDY_PLACEHOLDER_DOMAIN &&
    /^[a-z0-9.-]+(:\d+)?$/i.test(domain)
  ) {
    return `https://${domain}`;
  }
  return null;
}

/** Whether every mail can carry a working unsubscribe link. */
export function isMailLinkConfigured(): boolean {
  return getMailLinkBase() !== null;
}

/**
 * Whether the server can send mail on its own key (for /api/notifications/status):
 * a Resend key, a From address and an https address for the unsubscribe link.
 */
export function isResendConfigured(): boolean {
  return getServerConfig() !== null && isMailLinkConfigured();
}

// =============================================================================
// Client cache (one client per API key)
// =============================================================================

const clientCache = new Map<string, Resend>();

function getClient(apiKey: string): Resend {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new Resend(apiKey);
    clientCache.set(apiKey, client);
  }
  return client;
}

// =============================================================================
// Send
// =============================================================================

const MAIL_LINK_NOT_CONFIGURED =
  'Every mail carries an unsubscribe link to this server. Set SAFEOS_API_PUBLIC_URL to its https address (or SAFEOS_DOMAIN behind the bundled Caddy) before sending mail.';

/**
 * Send an email via Resend.
 *
 * Resolution order for credentials:
 *   1. `options.override` (per-user / per-call values)
 *   2. server env (RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO)
 *
 * Each recipient gets a mail of its own with a link bound to its address.
 * A recipient whose address is suppressed for this kind of mail is skipped;
 * when every recipient is suppressed, nothing is sent and
 * `EmailSuppressedError` is thrown.
 *
 * Throws `EmailNotConfiguredError` when neither path yields a complete config,
 * or when no https address for the unsubscribe link is set.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  if (!isMailKind(options.kind)) {
    throw new Error(`Unknown mail kind: ${String(options.kind)}`);
  }

  const server = getServerConfig();
  const config: EmailConfig = {
    apiKey: options.override?.apiKey ?? server?.apiKey ?? '',
    from: options.fromOverride ?? options.override?.from ?? server?.from ?? '',
    replyTo: options.override?.replyTo ?? server?.replyTo,
  };

  if (!config.apiKey || !config.from) {
    throw new EmailNotConfiguredError(
      'Resend is not configured. Set RESEND_API_KEY + EMAIL_FROM (server) or provide an override.',
    );
  }

  const linkBase = getMailLinkBase();
  if (!linkBase) {
    throw new EmailNotConfiguredError(MAIL_LINK_NOT_CONFIGURED);
  }

  const info = MAIL_KINDS[options.kind];
  const store = getMailSuppressionStore();
  const recipients = (Array.isArray(options.to) ? options.to : [options.to])
    .map((address) => address.trim())
    .filter((address) => address.length > 0);

  const client = getClient(config.apiKey);
  const bodyText = options.text ?? htmlToText(options.html);
  const tags = options.severity
    ? [{ name: 'severity', value: options.severity }]
    : undefined;

  const ids: string[] = [];
  const sentTo: string[] = [];

  for (const address of recipients) {
    if (await store.isSuppressed(address, info.category)) continue;

    const token = await store.issueToken(address, info.category);
    const unsubscribeUrl = `${linkBase}/api/mail/unsubscribe/${token}`;
    const idempotencyKey = options.idempotencyKey
      ? recipients.length > 1
        ? `${options.idempotencyKey}:${address}`
        : options.idempotencyKey
      : undefined;

    const payload = {
      from: config.from,
      to: address,
      subject: options.subject,
      html: `${options.html}${renderFooterHtml(info.why, unsubscribeUrl)}`,
      text: `${bodyText}\n\n${renderFooterText(info.why, unsubscribeUrl)}`,
      replyTo: config.replyTo,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags,
    };
    // Resend reads the idempotency key from the request, not from the mail's headers.
    const response = idempotencyKey
      ? await client.emails.send(payload, { idempotencyKey })
      : await client.emails.send(payload);

    if (response.error) {
      throw new Error(`Resend send failed: ${response.error.message}`);
    }

    const id = response.data?.id;
    if (!id) {
      throw new Error('Resend returned no message id');
    }

    ids.push(id);
    sentTo.push(address);
  }

  if (ids.length === 0) {
    throw new EmailSuppressedError(
      info.required
        ? 'Mail to this address is stopped.'
        : 'The recipient turned this mail off.',
    );
  }

  return {
    id: ids[0],
    ids,
    to: Array.isArray(options.to) ? sentTo : sentTo[0],
    from: config.from,
  };
}

// =============================================================================
// Templates
// =============================================================================

/**
 * Send a severity-coloured alert email. Used by NotificationManager.
 */
export async function sendAlertEmail(
  to: string,
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical',
  title: string,
  message: string,
  options: {
    override?: Partial<EmailConfig>;
    fromOverride?: string;
    streamId?: string;
    alertId?: string;
    thumbnailUrl?: string;
    timestamp?: string;
    siteUrl?: string;
  } = {},
): Promise<SendEmailResult> {
  const html = renderAlertEmail({
    severity,
    title,
    message,
    streamId: options.streamId,
    alertId: options.alertId,
    thumbnailUrl: options.thumbnailUrl,
    timestamp: options.timestamp ?? new Date().toISOString(),
    siteUrl: options.siteUrl ?? process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://safeos.sh',
  });

  return sendEmail({
    kind: 'alert',
    to,
    subject: `[SafeOS ${severity.toUpperCase()}] ${title}`,
    html,
    severity,
    override: options.override,
    fromOverride: options.fromOverride,
    idempotencyKey: options.alertId,
  });
}

/**
 * Send an account verification email. Always uses server-level config —
 * per-user keys are not allowed for transactional auth mail.
 */
export async function sendVerificationEmail(
  to: string,
  verificationUrl: string,
  displayName?: string,
): Promise<SendEmailResult> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : 'Hi,';
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1a1f24;">
      <h1 style="font-size:20px;margin:0 0 16px;">Verify your SafeOS Guardian account</h1>
      <p>${greeting}</p>
      <p>Click the link below to confirm your email address. This link expires in 24 hours.</p>
      <p style="margin:24px 0;">
        <a href="${verificationUrl}" style="background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
          Verify email
        </a>
      </p>
      <p style="color:#5a6270;font-size:14px;">
        If the button doesn't work, paste this URL into your browser:<br>
        <span style="word-break:break-all;">${verificationUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#5a6270;font-size:13px;">
        If it wasn't you, ignore this email.
      </p>
    </div>
  `;

  return sendEmail({
    kind: 'verification',
    to,
    subject: 'Verify your SafeOS Guardian account',
    html,
    idempotencyKey: `verify:${to}:${verificationUrl}`,
  });
}

/**
 * Send a password reset email. Always uses server-level config.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  displayName?: string,
): Promise<SendEmailResult> {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : 'Hi,';
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1a1f24;">
      <h1 style="font-size:20px;margin:0 0 16px;">Reset your SafeOS Guardian password</h1>
      <p>${greeting}</p>
      <p>We received a request to reset the password on your SafeOS Guardian account. Click below to choose a new one. This link expires in 1 hour.</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}" style="background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
          Reset password
        </a>
      </p>
      <p style="color:#5a6270;font-size:14px;">
        If you didn't request this, you can safely ignore this email — your password will stay the same.
      </p>
    </div>
  `;

  return sendEmail({
    kind: 'password-reset',
    to,
    subject: 'Reset your SafeOS Guardian password',
    html,
    idempotencyKey: `reset:${to}:${resetUrl}`,
  });
}

/**
 * Send a one-off test email so users can verify their Resend config works.
 */
export async function sendTestEmail(
  to: string,
  options: { override?: Partial<EmailConfig>; fromOverride?: string } = {},
): Promise<SendEmailResult> {
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1a1f24;">
      <h1 style="font-size:20px;margin:0 0 16px;">SafeOS Guardian email is working ✅</h1>
      <p>This is a test email sent from your Settings → Notifications page.</p>
      <p>If you're seeing this, alerts will reach you when SafeOS Guardian detects something important.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#5a6270;font-size:13px;">Sent at ${new Date().toISOString()}</p>
    </div>
  `;

  return sendEmail({
    kind: 'test',
    to,
    subject: 'SafeOS Guardian — email is working',
    html,
    override: options.override,
    fromOverride: options.fromOverride,
  });
}

// =============================================================================
// Internal helpers
// =============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  info: '#3b82f6',
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

function renderAlertEmail(params: {
  severity: keyof typeof SEVERITY_COLORS;
  title: string;
  message: string;
  streamId?: string;
  alertId?: string;
  thumbnailUrl?: string;
  timestamp: string;
  siteUrl: string;
}): string {
  const color = SEVERITY_COLORS[params.severity] ?? SEVERITY_COLORS.info;
  const safeTitle = escapeHtml(params.title);
  const safeMessage = escapeHtml(params.message);
  const historyUrl = `${params.siteUrl.replace(/\/+$/, '')}/history${params.alertId ? `?alert=${encodeURIComponent(params.alertId)}` : ''}`;

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1a1f24;">
      <div style="background:${color};color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">
        ${params.severity}
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;padding:20px;">
        <h1 style="font-size:20px;margin:0 0 8px;">${safeTitle}</h1>
        <p style="margin:0 0 16px;color:#374151;">${safeMessage}</p>
        ${params.thumbnailUrl ? `<img src="${params.thumbnailUrl}" alt="Detection thumbnail" style="max-width:100%;border-radius:6px;margin:8px 0;">` : ''}
        <p style="color:#5a6270;font-size:13px;margin:16px 0 8px;">
          ${params.streamId ? `<strong>Stream:</strong> ${escapeHtml(params.streamId)}<br>` : ''}
          <strong>Time:</strong> ${escapeHtml(params.timestamp)}
        </p>
        <p style="margin:20px 0 0;">
          <a href="${historyUrl}" style="background:#10b981;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
            Open SafeOS Guardian
          </a>
        </p>
      </div>
      <p style="color:#5a6270;font-size:13px;text-align:center;margin:16px 0 0;">
        SafeOS Guardian is a supplemental monitoring tool. It does not replace human supervision.
      </p>
    </div>
  `;
}

/**
 * Footer appended to every mail: why the person gets it, and the
 * Unsubscribe link (13px, legible at a phone's width).
 */
function renderFooterHtml(why: string, unsubscribeUrl: string): string {
  const href = escapeHtml(unsubscribeUrl);
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:24px auto 0;padding:16px 0 0;border-top:1px solid #e5e7eb;color:#5a6270;font-size:13px;line-height:1.5;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;">${escapeHtml(why)}</p>
      <p style="margin:0;font-size:13px;">
        <a href="${href}" style="color:#047857;font-size:13px;text-decoration:underline;">Unsubscribe</a>
      </p>
    </div>
  `;
}

function renderFooterText(why: string, unsubscribeUrl: string): string {
  return `--\n${why}\nUnsubscribe: ${unsubscribeUrl}`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// =============================================================================
// Errors
// =============================================================================

export class EmailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailNotConfiguredError';
  }
}

/** Every recipient of a send is on the suppression list for that kind of mail. */
export class EmailSuppressedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSuppressedError';
  }
}
