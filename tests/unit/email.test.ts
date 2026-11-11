/**
 * Email (Resend) Service Unit Tests
 *
 * Exercises every branch of src/lib/alerts/email.ts: config resolution,
 * server vs BYO override, error handling, template rendering, and the
 * htmlToText fallback.
 *
 * @module tests/unit/email
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Resend SDK mock
// =============================================================================

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

// The suppression store is exercised against a real database in
// tests/integration/mail-unsubscribe.test.ts; here every address is open.
vi.mock('../../src/lib/alerts/mail-suppression.js', () => ({
  getMailSuppressionStore: () => ({
    issueToken: async () => 'T'.repeat(43),
    isSuppressed: async () => false,
  }),
}));

// Pull the module after the mock is in place
let email: typeof import('../../src/lib/alerts/email.js');

beforeEach(async () => {
  vi.resetModules();
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'msg_test_123' }, error: null });
  // Default: server has a key
  process.env['RESEND_API_KEY'] = 're_server_key';
  process.env['EMAIL_FROM'] = 'SafeOS <alerts@safeos.test>';
  process.env['EMAIL_REPLY_TO'] = 'team@safeos.test';
  process.env['SAFEOS_API_PUBLIC_URL'] = 'https://api.safeos.test';
  email = await import('../../src/lib/alerts/email.js');
});

afterEach(() => {
  delete process.env['RESEND_API_KEY'];
  delete process.env['EMAIL_FROM'];
  delete process.env['EMAIL_REPLY_TO'];
  delete process.env['SAFEOS_API_PUBLIC_URL'];
  delete process.env['NEXT_PUBLIC_SITE_URL'];
});

// =============================================================================
// isResendConfigured
// =============================================================================

describe('isResendConfigured', () => {
  it('returns true when RESEND_API_KEY and EMAIL_FROM are set', () => {
    expect(email.isResendConfigured()).toBe(true);
  });

  it('returns false when RESEND_API_KEY is missing', async () => {
    delete process.env['RESEND_API_KEY'];
    vi.resetModules();
    email = await import('../../src/lib/alerts/email.js');
    expect(email.isResendConfigured()).toBe(false);
  });

  it('returns false when EMAIL_FROM is missing', async () => {
    delete process.env['EMAIL_FROM'];
    vi.resetModules();
    email = await import('../../src/lib/alerts/email.js');
    expect(email.isResendConfigured()).toBe(false);
  });
});

// =============================================================================
// sendEmail — config resolution
// =============================================================================

describe('sendEmail', () => {
  it('returns a result with id, to, and from on success', async () => {
    const result = await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
    });

    expect(result.id).toBe('msg_test_123');
    expect(result.to).toBe('user@example.com');
    expect(result.from).toBe('SafeOS <alerts@safeos.test>');
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it('uses server env values when no override is supplied', async () => {
    await email.sendEmail({ kind: 'alert', to: 'user@example.com', subject: 'Hi', html: '<p>Body</p>' });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'SafeOS <alerts@safeos.test>',
        replyTo: 'team@safeos.test',
      }),
    );
  });

  it('passes through a user-supplied API key override', async () => {
    const { Resend } = await import('resend');
    (Resend as any).mockClear();

    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
      override: { apiKey: 're_user_key' },
    });

    expect(Resend).toHaveBeenCalledWith('re_user_key');
  });

  it('uses fromOverride when supplied', async () => {
    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
      fromOverride: 'Custom <custom@user.test>',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Custom <custom@user.test>' }),
    );
  });

  it('prefers override.from over server EMAIL_FROM', async () => {
    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
      override: { apiKey: 're_user_key', from: 'Override <override@user.test>' },
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Override <override@user.test>' }),
    );
  });

  it('prefers fromOverride over override.from', async () => {
    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
      override: { apiKey: 're_user_key', from: 'A <a@a.test>' },
      fromOverride: 'B <b@b.test>',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'B <b@b.test>' }),
    );
  });

  // -------- error paths --------

  it('throws EmailNotConfiguredError when no key is available anywhere', async () => {
    delete process.env['RESEND_API_KEY'];
    delete process.env['EMAIL_FROM'];
    vi.resetModules();
    email = await import('../../src/lib/alerts/email.js');

    await expect(
      email.sendEmail({ kind: 'alert', to: 'user@example.com', subject: 'Hi', html: '<p>Body</p>' }),
    ).rejects.toBeInstanceOf(email.EmailNotConfiguredError);
  });

  it('throws EmailNotConfiguredError when key present but EMAIL_FROM missing', async () => {
    delete process.env['EMAIL_FROM'];
    vi.resetModules();
    email = await import('../../src/lib/alerts/email.js');

    await expect(
      email.sendEmail({ kind: 'alert', to: 'user@example.com', subject: 'Hi', html: '<p>Body</p>' }),
    ).rejects.toBeInstanceOf(email.EmailNotConfiguredError);
  });

  it('throws when Resend SDK returns an error', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Domain not verified' },
    });

    await expect(
      email.sendEmail({ kind: 'alert', to: 'user@example.com', subject: 'Hi', html: '<p>Body</p>' }),
    ).rejects.toThrow(/Resend send failed: Domain not verified/);
  });

  it('throws when Resend returns no error and no id', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      email.sendEmail({ kind: 'alert', to: 'user@example.com', subject: 'Hi', html: '<p>Body</p>' }),
    ).rejects.toThrow(/Resend returned no message id/);
  });

  // -------- options passthrough --------

  it('passes idempotencyKey as a request option, never as a mail header', async () => {
    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
      idempotencyKey: 'alert-42',
    });

    const [payload, requestOptions] = sendMock.mock.calls[0];
    expect(requestOptions).toEqual({ idempotencyKey: 'alert-42' });
    expect(payload.headers).not.toHaveProperty('Idempotency-Key');
  });

  it('carries only the unsubscribe headers when no idempotencyKey is set', async () => {
    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
    });

    const [payload, requestOptions] = sendMock.mock.calls[0];
    expect(requestOptions).toBeUndefined();
    expect(payload.headers).toEqual({
      'List-Unsubscribe': `<https://api.safeos.test/api/mail/unsubscribe/${'T'.repeat(43)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('adds severity tag when severity is set', async () => {
    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
      severity: 'critical',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [{ name: 'severity', value: 'critical' }] }),
    );
  });

  it('omits tags when severity is not set', async () => {
    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Body</p>',
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.tags).toBeUndefined();
  });

  it('accepts an array of recipients', async () => {
    const result = await email.sendEmail({
      kind: 'alert',
      to: ['a@example.com', 'b@example.com'],
      subject: 'Hi',
      html: '<p>Body</p>',
    });

    expect(result.to).toEqual(['a@example.com', 'b@example.com']);
    // One mail per recipient, so each carries a link bound to its own address.
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[0][0].to).toBe('a@example.com');
    expect(sendMock.mock.calls[1][0].to).toBe('b@example.com');
  });

  it('auto-generates plain-text fallback when text is not supplied', async () => {
    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>Hello <strong>world</strong></p><br>Line 2',
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.text).toBeDefined();
    expect(call.text).toContain('Hello world');
    expect(call.text).toContain('Line 2');
    expect(call.text).not.toMatch(/<\/?[a-z]/i);
  });

  it('uses the supplied text body when given', async () => {
    await email.sendEmail({
      kind: 'alert',
      to: 'user@example.com',
      subject: 'Hi',
      html: '<p>HTML</p>',
      text: 'Plain text version',
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.text.startsWith('Plain text version')).toBe(true);
    expect(call.text).toContain(`Unsubscribe: https://api.safeos.test/api/mail/unsubscribe/${'T'.repeat(43)}`);
  });

  it('caches Resend client per API key', async () => {
    const { Resend } = await import('resend');
    (Resend as any).mockClear();

    await email.sendEmail({ kind: 'alert', to: 'a@a.test', subject: 'X', html: '<p>1</p>' });
    await email.sendEmail({ kind: 'alert', to: 'b@b.test', subject: 'X', html: '<p>2</p>' });

    // Same server key → constructor called only once
    expect(Resend).toHaveBeenCalledTimes(1);

    await email.sendEmail({
      kind: 'alert',
      to: 'c@c.test',
      subject: 'X',
      html: '<p>3</p>',
      override: { apiKey: 're_different_key' },
    });

    // New key → constructor called again
    expect(Resend).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// sendAlertEmail
// =============================================================================

describe('sendAlertEmail', () => {
  it('includes severity-tagged subject', async () => {
    await email.sendAlertEmail('user@example.com', 'critical', 'Motion detected', 'Front door');

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[SafeOS CRITICAL] Motion detected',
      }),
    );
  });

  it('sets severity tag on the underlying send', async () => {
    await email.sendAlertEmail('user@example.com', 'high', 'Loud noise', 'Living room');

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [{ name: 'severity', value: 'high' }] }),
    );
  });

  it('uses alertId as idempotency key', async () => {
    await email.sendAlertEmail('user@example.com', 'medium', 'Title', 'Body', {
      alertId: 'alert-abc-123',
    });

    expect(sendMock.mock.calls[0][1]).toEqual({ idempotencyKey: 'alert-abc-123' });
  });

  it('embeds the thumbnail URL in the HTML when provided', async () => {
    await email.sendAlertEmail('user@example.com', 'medium', 'Title', 'Body', {
      thumbnailUrl: 'https://example.com/thumb.jpg',
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.html).toContain('https://example.com/thumb.jpg');
  });

  it('omits thumbnail markup when no URL is given', async () => {
    await email.sendAlertEmail('user@example.com', 'medium', 'Title', 'Body');

    const call = sendMock.mock.calls[0][0];
    expect(call.html).not.toContain('<img');
  });

  it('escapes HTML special characters in title and message', async () => {
    await email.sendAlertEmail(
      'user@example.com',
      'critical',
      'Title <script>',
      'Body "quoted" & ampersand',
    );

    const call = sendMock.mock.calls[0][0];
    expect(call.html).not.toContain('<script>');
    expect(call.html).toContain('&lt;script&gt;');
    expect(call.html).toContain('&amp; ampersand');
    expect(call.html).toContain('&quot;quoted&quot;');
  });

  it('respects NEXT_PUBLIC_SITE_URL for the open-app link', async () => {
    process.env['NEXT_PUBLIC_SITE_URL'] = 'https://custom.example.com';
    await email.sendAlertEmail('user@example.com', 'medium', 'Title', 'Body', {
      alertId: 'alrt-1',
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.html).toContain('https://custom.example.com/history?alert=alrt-1');
  });

  it('forwards override + fromOverride to underlying send', async () => {
    await email.sendAlertEmail('user@example.com', 'high', 'T', 'M', {
      override: { apiKey: 're_byo' },
      fromOverride: 'BYO <byo@user.test>',
    });

    const { Resend } = await import('resend');
    expect(Resend).toHaveBeenCalledWith('re_byo');
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'BYO <byo@user.test>' }),
    );
  });

  it('includes streamId in the email body when supplied', async () => {
    await email.sendAlertEmail('user@example.com', 'medium', 'T', 'M', {
      streamId: 'kitchen-cam-01',
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.html).toContain('kitchen-cam-01');
    expect(call.html).toContain('<strong>Stream:</strong>');
  });

  it('escapes HTML in streamId', async () => {
    await email.sendAlertEmail('user@example.com', 'medium', 'T', 'M', {
      streamId: '<dangerous>',
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.html).not.toContain('<dangerous>');
    expect(call.html).toContain('&lt;dangerous&gt;');
  });

  it('uses provided timestamp instead of generating one', async () => {
    await email.sendAlertEmail('user@example.com', 'high', 'T', 'M', {
      timestamp: '2026-05-12T10:00:00Z',
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.html).toContain('2026-05-12T10:00:00Z');
  });

  it('uses siteUrl override for history link', async () => {
    await email.sendAlertEmail('user@example.com', 'high', 'T', 'M', {
      siteUrl: 'https://safeos.example.com/',
      alertId: 'x1',
    });

    const call = sendMock.mock.calls[0][0];
    // trailing slash stripped
    expect(call.html).toContain('https://safeos.example.com/history?alert=x1');
  });
});

// =============================================================================
// sendVerificationEmail
// =============================================================================

describe('sendVerificationEmail', () => {
  it('builds a verification subject and link', async () => {
    await email.sendVerificationEmail(
      'new@example.com',
      'https://safeos.sh/verify-email?token=abc',
      'Alice',
    );

    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('new@example.com');
    expect(call.subject).toBe('Verify your SafeOS Guardian account');
    expect(call.html).toContain('https://safeos.sh/verify-email?token=abc');
    expect(call.html).toContain('Alice');
  });

  it('handles missing displayName gracefully', async () => {
    await email.sendVerificationEmail('new@example.com', 'https://safeos.sh/verify?token=xyz');

    const call = sendMock.mock.calls[0][0];
    expect(call.html).toContain('Hi,');
  });

  it('escapes HTML in the displayName', async () => {
    await email.sendVerificationEmail(
      'x@example.com',
      'https://x.test/v',
      'Mallory <script>alert(1)</script>',
    );

    const call = sendMock.mock.calls[0][0];
    expect(call.html).not.toContain('<script>alert(1)</script>');
    expect(call.html).toContain('&lt;script&gt;');
  });

  it('uses a deterministic idempotency key', async () => {
    await email.sendVerificationEmail('x@example.com', 'https://x.test/v');

    expect(sendMock.mock.calls[0][1]).toEqual({ idempotencyKey: 'verify:x@example.com:https://x.test/v' });
  });
});

// =============================================================================
// sendPasswordResetEmail
// =============================================================================

describe('sendPasswordResetEmail', () => {
  it('builds a reset subject and link', async () => {
    await email.sendPasswordResetEmail(
      'user@example.com',
      'https://safeos.sh/reset-password?token=t1',
      'Bob',
    );

    const call = sendMock.mock.calls[0][0];
    expect(call.subject).toBe('Reset your SafeOS Guardian password');
    expect(call.html).toContain('https://safeos.sh/reset-password?token=t1');
    expect(call.html).toContain('Bob');
  });

  it('uses a deterministic idempotency key based on URL', async () => {
    await email.sendPasswordResetEmail('user@example.com', 'https://x.test/r');

    expect(sendMock.mock.calls[0][1]).toEqual({ idempotencyKey: 'reset:user@example.com:https://x.test/r' });
  });
});

// =============================================================================
// sendTestEmail
// =============================================================================

describe('sendTestEmail', () => {
  it('sends to the supplied recipient with a working subject', async () => {
    const result = await email.sendTestEmail('test@example.com');

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'test@example.com',
        subject: 'SafeOS Guardian — email is working',
      }),
    );
    expect(result.id).toBe('msg_test_123');
  });

  it('forwards override + fromOverride options', async () => {
    await email.sendTestEmail('test@example.com', {
      override: { apiKey: 're_byo_test' },
      fromOverride: 'Test <test@user.test>',
    });

    const { Resend } = await import('resend');
    expect(Resend).toHaveBeenCalledWith('re_byo_test');
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Test <test@user.test>' }),
    );
  });
});

// =============================================================================
// EmailNotConfiguredError
// =============================================================================

describe('EmailNotConfiguredError', () => {
  it('has the correct name', () => {
    const err = new email.EmailNotConfiguredError('test message');
    expect(err.name).toBe('EmailNotConfiguredError');
    expect(err.message).toBe('test message');
    expect(err).toBeInstanceOf(Error);
  });
});
