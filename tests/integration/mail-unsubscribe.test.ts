/**
 * Unsubscribe Path Integration Tests
 *
 * Sends every SafeOS Guardian mail through its real sender (the Resend client
 * is stubbed where the request would leave the process), then drives the
 * unsubscribe page and the RFC 8058 one-click POST over HTTP against a real
 * database file.
 *
 * @module tests/integration/mail-unsubscribe.test
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDatabase } from '@framers/sql-storage-adapter';

const { sendMock, dbRef } = vi.hoisted(() => ({ sendMock: vi.fn(), dbRef: { current: null as any } }));

// The test mail route signs its caller in against the app database; point it
// at this test's database file.
vi.mock('../../src/db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/index.js')>();
  return { ...actual, getSafeOSDatabase: async () => dbRef.current };
});

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import {
  sendAlertEmail,
  sendEmail,
  sendPasswordResetEmail,
  sendTestEmail,
  sendVerificationEmail,
  isResendConfigured,
  EmailNotConfiguredError,
  EmailSendError,
  EmailSuppressedError,
} from '../../src/lib/alerts/email.js';
import {
  MailSuppressionStore,
  setMailSuppressionStore,
  suppressAddressesFromText,
  resubscribeAddressesFromText,
} from '../../src/lib/alerts/mail-suppression.js';
import { NotificationManager } from '../../src/lib/alerts/notification-manager.js';
import { createMailRoutes } from '../../src/api/routes/mail.js';
import { notificationRoutes } from '../../src/api/routes/notifications.js';
import { requestLogger } from '../../src/api/middleware/request-log.js';
import { runMigrations } from '../../src/db/index.js';

// =============================================================================
// Harness
// =============================================================================

const PUBLIC_API = 'https://api.safeos.test';
const UNSUBSCRIBE_URL = /^https:\/\/api\.safeos\.test\/api\/mail\/unsubscribe\/([A-Za-z0-9_-]{43})$/;

let dir: string;
let db: any;
let store: MailSuppressionStore;
let server: Server;
let local: string;

interface SentMail {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

function mailAt(index: number): SentMail {
  return sendMock.mock.calls[index][0] as SentMail;
}

function requestOptionsAt(index: number): unknown {
  return sendMock.mock.calls[index][1];
}

/** The public link points at the operator's API; the test server listens locally. */
function toLocal(url: string): string {
  return url.replace(PUBLIC_API, local);
}

/**
 * Asserts the parts every mail must carry and returns its unsubscribe URL.
 */
function expectUnsubscribeParts(mail: SentMail): string {
  const header = mail.headers?.['List-Unsubscribe'];
  expect(header).toMatch(/^<https:\/\/[^>]+>$/);
  const url = String(header).slice(1, -1);
  expect(url).toMatch(UNSUBSCRIBE_URL);
  expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  // The idempotency key is a request option, never a header in the delivered mail.
  expect(mail.headers).not.toHaveProperty('Idempotency-Key');

  // A visible link in the footer, to the same URL.
  const link = mail.html.match(/<a\b[^>]*href="([^"]+)"[^>]*>\s*Unsubscribe\s*<\/a>/i);
  expect(link?.[1]).toBe(url);

  // Nothing a person reads is under 13px at a phone's width.
  const sizes = [...mail.html.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  expect(sizes.length).toBeGreaterThan(0);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(13);

  // The plain-text part carries the same link.
  expect(mail.text).toContain(`Unsubscribe: ${url}`);
  return url;
}

function oneClick(url: string): Promise<Response> {
  return fetch(toLocal(url), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'List-Unsubscribe=One-Click',
  });
}

/** The test mail on the server's Resend account is the operator's. */
const OPERATOR_TOKEN = 'operator-session-token';

function testEmailRoute(to: string): Promise<Response> {
  return fetch(`${local}/api/notifications/test-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-session-token': OPERATOR_TOKEN },
    body: JSON.stringify({ to }),
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'safeos-mail-'));
  db = await createDatabase({
    file: join(dir, 'mail.sqlite3'),
    priority: ['better-sqlite3', 'sqljs'],
  } as any);
  store = new MailSuppressionStore(async () => db);
  setMailSuppressionStore(store);

  dbRef.current = db;
  await runMigrations(db);
  const stamp = new Date().toISOString();
  await db.run(
    `INSERT INTO user_profiles (id, display_name, role, created_at, updated_at) VALUES (?, ?, 'operator', ?, ?)`,
    ['operator-profile', 'Operator', stamp, stamp]
  );
  await db.run(
    `INSERT INTO sessions (id, token, is_guest, profile_id, created_at, expires_at, last_active_at)
     VALUES (?, ?, 0, ?, ?, ?, ?)`,
    ['operator-session', OPERATOR_TOKEN, 'operator-profile', stamp, new Date(Date.now() + 3_600_000).toISOString(), stamp]
  );

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/mail', createMailRoutes(store));
  app.use('/api/notifications', notificationRoutes);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  setMailSuppressionStore(null);
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  sendMock.mockReset();
  let sent = 0;
  sendMock.mockImplementation(async () => ({ data: { id: `msg_${++sent}` }, error: null }));
  process.env['RESEND_API_KEY'] = 're_server_key';
  process.env['EMAIL_FROM'] = 'SafeOS Guardian <alerts@safeos.test>';
  process.env['EMAIL_REPLY_TO'] = 'team@safeos.test';
  process.env['SAFEOS_API_PUBLIC_URL'] = PUBLIC_API;
  delete process.env['SAFEOS_DOMAIN'];
});

afterEach(() => {
  delete process.env['RESEND_API_KEY'];
  delete process.env['EMAIL_FROM'];
  delete process.env['EMAIL_REPLY_TO'];
  delete process.env['SAFEOS_API_PUBLIC_URL'];
  delete process.env['SAFEOS_DOMAIN'];
});

// =============================================================================
// Every mail carries the link and both headers
// =============================================================================

describe('every mail carries an unsubscribe link and the one-click headers', () => {
  it('alert mail sent by the notification manager', async () => {
    const manager = new NotificationManager({
      browserPush: false,
      email: true,
      emailRecipient: 'parent@example.com',
    }, 'operator-profile');

    const results = await manager.notify({
      streamId: 'nursery',
      alertId: 'alert-1',
      severity: 'high',
      title: 'Crying detected',
      message: 'Nursery camera',
      timestamp: '2026-11-05T10:00:00Z',
    });

    expect(results.find((r) => r.channel === 'email')?.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = mailAt(0);
    expect(mail.to).toBe('parent@example.com');
    expectUnsubscribeParts(mail);
    expect(mail.html).toContain('alert email is turned on');
    expect(requestOptionsAt(0)).toEqual({ idempotencyKey: 'alert-1' });
  });

  it('account verification mail', async () => {
    await sendVerificationEmail('new@example.com', 'https://safeos.sh/verify-email?token=abc', 'Alice');

    const mail = mailAt(0);
    expect(mail.to).toBe('new@example.com');
    expectUnsubscribeParts(mail);
    expect(mail.html).toContain('signed up');
  });

  it('password reset mail', async () => {
    await sendPasswordResetEmail('user@example.com', 'https://safeos.sh/reset-password?token=t1', 'Bob');

    const mail = mailAt(0);
    expect(mail.to).toBe('user@example.com');
    expectUnsubscribeParts(mail);
    expect(mail.html).toContain('reset the password');
  });

  it('settings test mail sent through the test-email route', async () => {
    const res = await testEmailRoute('tester@example.com');

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = mailAt(0);
    expect(mail.to).toBe('tester@example.com');
    expectUnsubscribeParts(mail);
    expect(mail.html).toContain('test message');
  });

  it('sends one mail per recipient, each with its own link', async () => {
    await sendEmail({
      kind: 'alert',
      to: ['a@example.com', 'b@example.com'],
      subject: 'Hi',
      html: '<p>Body</p>',
    });

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(mailAt(0).to).toBe('a@example.com');
    expect(mailAt(1).to).toBe('b@example.com');
    expect(expectUnsubscribeParts(mailAt(0))).not.toBe(expectUnsubscribeParts(mailAt(1)));
  });

  it('refuses an unknown kind of mail', async () => {
    await expect(
      sendEmail({ kind: 'newsletter' as any, to: 'x@example.com', subject: 'S', html: '<p>x</p>' }),
    ).rejects.toThrow(/Unknown mail kind/);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// The unsubscribe link
// =============================================================================

describe('the unsubscribe link', () => {
  it('a GET only asks: alert mail keeps coming until the POST', async () => {
    await sendAlertEmail('gina@example.com', 'high', 'Motion', 'Hall');
    const url = expectUnsubscribeParts(mailAt(0));

    const page = await fetch(toLocal(url));
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toMatch(/text\/html/);
    const html = await page.text();
    expect(html).toMatch(/<form[^>]*method="post"/i);
    expect(html).toContain('Unsubscribe');

    const head = await fetch(toLocal(url), { method: 'HEAD' });
    expect(head.status).toBe(200);

    await sendAlertEmail('gina@example.com', 'high', 'Motion again', 'Hall');
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('the one-click POST stops alert mail at once, answers a blank 200 and sends no confirmation', async () => {
    await sendAlertEmail('olive@example.com', 'high', 'Motion', 'Hall');
    const url = expectUnsubscribeParts(mailAt(0));
    const before = sendMock.mock.calls.length;

    const res = await oneClick(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(sendMock.mock.calls.length).toBe(before);

    await expect(sendAlertEmail('olive@example.com', 'critical', 'Smoke', 'Kitchen')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );
    await expect(sendAlertEmail(' OLIVE@Example.com ', 'critical', 'Smoke', 'Kitchen')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );

    // The settings test message to that address is refused as well.
    const test = await testEmailRoute('olive@example.com');
    expect(test.status).toBe(409);

    // The notification manager reports the channel as skipped, not sent.
    const manager = new NotificationManager({
      browserPush: false,
      email: true,
      emailRecipient: 'olive@example.com',
    }, 'operator-profile');
    const results = await manager.notify({
      streamId: 'kitchen',
      alertId: 'alert-2',
      severity: 'critical',
      title: 'Smoke',
      message: 'Kitchen',
      timestamp: '2026-11-05T10:05:00Z',
    });
    expect(results.find((r) => r.channel === 'email')).toMatchObject({ success: false, skipped: true });
    expect(sendMock.mock.calls.length).toBe(before);

    // Other addresses are untouched, and account mail still comes when asked for.
    await sendAlertEmail('someone-else@example.com', 'high', 'Motion', 'Hall');
    await sendPasswordResetEmail('olive@example.com', 'https://safeos.sh/reset-password?token=r1');
    expect(sendMock.mock.calls.length).toBe(before + 2);
  });

  it('the page form turns off every optional mail and says so', async () => {
    await sendTestEmail('pat@example.com');
    const url = expectUnsubscribeParts(mailAt(0));

    const res = await fetch(toLocal(url), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'scope=optional',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toMatch(/unsubscribed/i);
    expect(sendMock).toHaveBeenCalledTimes(1);

    await expect(sendAlertEmail('pat@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );
  });

  it('account mail: the link opens the preferences page, which turns off optional mail and says what still comes', async () => {
    await sendVerificationEmail('rory@example.com', 'https://safeos.sh/verify-email?token=v1');
    const url = expectUnsubscribeParts(mailAt(0));

    const page = await fetch(toLocal(url));
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toMatch(/still/i);
    expect(html).toMatch(/only when/i);
    expect(html).toMatch(/delete/i);
    expect(html).toMatch(/<form[^>]*method="post"/i);

    // Alert mail still flows before the POST.
    await sendAlertEmail('rory@example.com', 'high', 'Motion', 'Hall');
    expect(sendMock).toHaveBeenCalledTimes(2);

    const res = await oneClick(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(sendMock).toHaveBeenCalledTimes(2);

    await expect(sendAlertEmail('rory@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );
    await sendPasswordResetEmail('rory@example.com', 'https://safeos.sh/reset-password?token=r2');
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('an unknown or malformed link changes nothing', async () => {
    const unknown = `${local}/api/mail/unsubscribe/${'A'.repeat(43)}`;
    expect((await fetch(unknown)).status).toBe(404);
    const post = await fetch(unknown, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(post.status).toBe(404);
    const malformed = await fetch(`${local}/api/mail/unsubscribe/not-a-token`, { method: 'POST' });
    expect(malformed.status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('keeps only hashes: no address and no token in the database', async () => {
    await sendAlertEmail('quinn@example.com', 'high', 'Motion', 'Hall');
    const url = expectUnsubscribeParts(mailAt(0));
    const token = String(url.match(UNSUBSCRIBE_URL)?.[1]);
    expect((await oneClick(url)).status).toBe(200);

    const rows = JSON.stringify([
      await db.all('SELECT * FROM mail_unsubscribe_tokens'),
      await db.all('SELECT * FROM mail_suppressions'),
    ]);
    expect(rows).not.toContain('quinn@example.com');
    expect(rows).not.toContain(token);
  });
});

// =============================================================================
// Retries and address forms
// =============================================================================

describe('retries and address forms', () => {
  it('a retried send with the same idempotency key sends the same mail, so Resend can match it', async () => {
    await sendAlertEmail('ivy@example.com', 'high', 'Motion', 'Hall', {
      alertId: 'alert-retry',
      timestamp: '2026-11-05T11:00:00Z',
    });
    await sendAlertEmail('ivy@example.com', 'high', 'Motion', 'Hall', {
      alertId: 'alert-retry',
      timestamp: '2026-11-05T11:00:00Z',
    });

    expect(requestOptionsAt(0)).toEqual({ idempotencyKey: 'alert-retry' });
    expect(requestOptionsAt(1)).toEqual({ idempotencyKey: 'alert-retry' });
    expect(mailAt(1).headers).toEqual(mailAt(0).headers);
    expect(mailAt(1).html).toBe(mailAt(0).html);
    expect(mailAt(1).text).toBe(mailAt(0).text);

    // A different alert gets a different link, and the shared link still works.
    await sendAlertEmail('ivy@example.com', 'high', 'Motion', 'Hall', { alertId: 'alert-other' });
    const url = expectUnsubscribeParts(mailAt(0));
    expect(expectUnsubscribeParts(mailAt(2))).not.toBe(url);
    expect((await oneClick(url)).status).toBe(200);
    await expect(sendAlertEmail('ivy@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );
  });

  it('keeps every idempotency key within Resend\'s 256 characters', async () => {
    const address = `${'x'.repeat(64)}@example.com`;
    const link = `https://safeos.sh/verify-email?token=${'a'.repeat(220)}`;
    await sendVerificationEmail(address, link);
    await sendVerificationEmail(address, link);

    const first = (requestOptionsAt(0) as { idempotencyKey: string }).idempotencyKey;
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(256);
    expect((requestOptionsAt(1) as { idempotencyKey: string }).idempotencyKey).toBe(first);
  });

  it('reads the mailbox out of a "Name <address>" recipient for every suppression', async () => {
    const stop = await suppressAddressesFromText('Alice Example <alice@example.com>\n', store);
    expect(stop).toEqual({ added: 1, skipped: 0 });
    await expect(sendAlertEmail('alice@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );
    await expect(
      sendVerificationEmail('Alice <ALICE@example.com>', 'https://safeos.sh/verify-email?token=c1'),
    ).rejects.toBeInstanceOf(EmailSuppressedError);

    await sendAlertEmail('Bea <bea@example.com>', 'high', 'Motion', 'Hall');
    expect(mailAt(0).to).toBe('Bea <bea@example.com>');
    expect((await oneClick(expectUnsubscribeParts(mailAt(0)))).status).toBe(200);
    await expect(sendAlertEmail('bea@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Failures, logs and the way back
// =============================================================================

describe('failures, logs and the way back', () => {
  it('a failure part-way through a send says which recipients already got the mail', async () => {
    sendMock.mockReset();
    sendMock
      .mockResolvedValueOnce({ data: { id: 'msg_first' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Rate limited' } });

    const failure = await sendEmail({
      kind: 'alert',
      to: ['first@example.com', 'second@example.com'],
      subject: 'Hi',
      html: '<p>Body</p>',
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailSendError);
    expect((failure as EmailSendError).message).toMatch(/Resend send failed: Rate limited/);
    expect((failure as EmailSendError).sent).toEqual([{ id: 'msg_first', to: 'first@example.com' }]);
  });

  it('a database failure on a later recipient still says which recipients got the mail', async () => {
    class FlakyStore extends MailSuppressionStore {
      async isSuppressed(address: string, category: any): Promise<boolean> {
        if (address.includes('flaky')) throw new Error('database is locked');
        return super.isSuppressed(address, category);
      }
    }
    setMailSuppressionStore(new FlakyStore(async () => db));
    try {
      const failure = await sendEmail({
        kind: 'alert',
        to: ['steady@example.com', 'flaky@example.com'],
        subject: 'Hi',
        html: '<p>Body</p>',
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(EmailSendError);
      expect((failure as EmailSendError).message).toMatch(/database is locked/);
      expect((failure as EmailSendError).sent).toEqual([{ id: 'msg_1', to: 'steady@example.com' }]);
    } finally {
      setMailSuppressionStore(store);
    }
  });

  it('the request log never shows an unsubscribe token', async () => {
    const app = express();
    app.use(requestLogger);
    app.use('/api/mail', createMailRoutes(store));
    const logged = createServer(app);
    await new Promise<void>((resolve) => logged.listen(0, '127.0.0.1', () => resolve()));
    const base = `http://127.0.0.1:${(logged.address() as AddressInfo).port}`;
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });

    try {
      await sendAlertEmail('lena@example.com', 'high', 'Motion', 'Hall');
      const url = expectUnsubscribeParts(mailAt(0));
      const token = String(url.match(UNSUBSCRIBE_URL)?.[1]);
      await fetch(url.replace(PUBLIC_API, base));
      // Express matches routes regardless of case, so this address works too.
      const shouted = url
        .replace(PUBLIC_API, base)
        .replace('/api/mail/unsubscribe/', '/API/MAIL/UNSUBSCRIBE/');
      expect((await fetch(shouted)).status).toBe(200);
      await fetch(url.replace(PUBLIC_API, base), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      });

      expect(lines.some((line) => line.includes('/api/mail/unsubscribe/'))).toBe(true);
      expect(lines.join('\n')).not.toContain(token);
    } finally {
      spy.mockRestore();
      await new Promise<void>((resolve) => logged.close(() => resolve()));
    }
  });

  it('the operator can turn mail back on for a person who asks, but never lifts a manual stop', async () => {
    await sendAlertEmail('max@example.com', 'high', 'Motion', 'Hall');
    expect((await oneClick(expectUnsubscribeParts(mailAt(0)))).status).toBe(200);
    await expect(sendAlertEmail('max@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );
    await suppressAddressesFromText('held@example.com\n', store);

    const result = await resubscribeAddressesFromText('Max <max@example.com>\nheld@example.com\nnope\n', store);
    expect(result).toEqual({ resubscribed: 1, unchanged: 1, skipped: 1 });

    await sendAlertEmail('max@example.com', 'high', 'Motion again', 'Hall');
    expect(sendMock).toHaveBeenCalledTimes(2);
    await expect(sendAlertEmail('held@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );
  });
});

// =============================================================================
// Manual stops and configuration
// =============================================================================

describe('manual stops and configuration', () => {
  it('a manual stop list blocks every mail to those addresses, account mail included', async () => {
    const result = await suppressAddressesFromText('# do not contact\nblocked@example.com\nnot an address\n', store);
    expect(result).toEqual({ added: 1, skipped: 1 });

    await expect(
      sendVerificationEmail('Blocked@Example.com', 'https://safeos.sh/verify-email?token=b1'),
    ).rejects.toBeInstanceOf(EmailSuppressedError);
    await expect(sendAlertEmail('blocked@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailSuppressedError,
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('refuses to send without an https address for the unsubscribe link', async () => {
    delete process.env['SAFEOS_API_PUBLIC_URL'];
    expect(isResendConfigured()).toBe(false);
    await expect(sendAlertEmail('dana@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailNotConfiguredError,
    );

    process.env['SAFEOS_API_PUBLIC_URL'] = 'http://api.safeos.test';
    await expect(sendAlertEmail('dana@example.com', 'high', 'Motion', 'Hall')).rejects.toBeInstanceOf(
      EmailNotConfiguredError,
    );
    expect((await testEmailRoute('dana@example.com')).status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();

    // The domain the bundled Caddy serves the API on is enough.
    delete process.env['SAFEOS_API_PUBLIC_URL'];
    process.env['SAFEOS_DOMAIN'] = 'guardian.example.org';
    expect(isResendConfigured()).toBe(true);
    await sendAlertEmail('dana@example.com', 'high', 'Motion', 'Hall');
    expect(mailAt(0).headers?.['List-Unsubscribe']).toMatch(
      /^<https:\/\/guardian\.example\.org\/api\/mail\/unsubscribe\/[A-Za-z0-9_-]{43}>$/,
    );
  });
});
