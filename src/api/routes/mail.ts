/**
 * Mail Routes
 *
 * The unsubscribe link every mail carries.
 *
 *   GET  /api/mail/unsubscribe/:token  a page that asks; changes nothing
 *   POST /api/mail/unsubscribe/:token  stops the mail at once
 *
 * A mailbox provider's one-click POST (RFC 8058, body
 * `List-Unsubscribe=One-Click`) gets a blank 200. The page's own form posts
 * `scope=optional` and gets a page saying what stopped. No mail is ever sent
 * about an unsubscribe.
 *
 * @module api/routes/mail
 */

import express, { Router, type Request, type Response } from 'express';
import {
  getMailSuppressionStore,
  type MailSuppressionStore,
} from '../../lib/alerts/mail-suppression.js';
import {
  isRequiredCategory,
  type MailCategory,
  type SuppressionScope,
} from '../../lib/alerts/mail-kinds.js';

// =============================================================================
// Router
// =============================================================================

/**
 * Build the mail router. Without a store it uses the shared one, looked up
 * on each request.
 */
export function createMailRoutes(store?: MailSuppressionStore): Router {
  const router = Router();
  const resolveStore = (): MailSuppressionStore => store ?? getMailSuppressionStore();

  router.use(express.urlencoded({ extended: false, limit: '2kb' }));

  router.get('/unsubscribe/:token', async (req: Request, res: Response) => {
    setPrivateHeaders(res);
    try {
      const record = await resolveStore().findToken(tokenParam(req));
      if (!record) {
        return sendPage(res, 404, gonePage());
      }
      return sendPage(res, 200, askPage(record.category));
    } catch (error) {
      console.error('[mail] unsubscribe page failed:', error instanceof Error ? error.message : 'unknown error');
      return sendPage(res, 500, errorPage());
    }
  });

  router.post('/unsubscribe/:token', async (req: Request, res: Response) => {
    setPrivateHeaders(res);
    try {
      const target = resolveStore();
      const record = await target.findToken(tokenParam(req));
      if (!record) {
        return res.status(404).type('text/plain').send('Unknown link.');
      }

      // The page's form turns off every optional mail. A one-click POST from a
      // mailbox stops the category of the mail it came from; on required mail
      // it turns off every optional mail, as the page would.
      const fromPage = typeof req.body?.scope === 'string';
      const scope: SuppressionScope =
        fromPage || isRequiredCategory(record.category) ? 'optional' : record.category;
      await target.suppressHash(record.addressHash, scope, 'unsubscribe');

      if (!fromPage) {
        return res.status(200).type('text/plain').send('');
      }
      return sendPage(res, 200, donePage(record.category));
    } catch (error) {
      console.error('[mail] unsubscribe failed:', error instanceof Error ? error.message : 'unknown error');
      return res.status(500).type('text/plain').send('Nothing was changed. Try the link again in a minute.');
    }
  });

  return router;
}

export const mailRoutes = createMailRoutes();

export default mailRoutes;

// =============================================================================
// Pages
// =============================================================================

function tokenParam(req: Request): string {
  const raw: unknown = req.params['token'];
  return typeof raw === 'string' ? raw : '';
}

function setPrivateHeaders(res: Response): void {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex');
}

function sendPage(res: Response, status: number, page: { title: string; body: string }): Response {
  return res.status(status).type('html').send(layout(page.title, page.body));
}

function askPage(category: MailCategory): { title: string; body: string } {
  if (isRequiredCategory(category)) {
    return {
      title: 'SafeOS Guardian account mail',
      body: `
        <h1>SafeOS Guardian account mail</h1>
        <p>Account mail still comes, because it is how you get into your account, and only when it is asked for:</p>
        <ul>
          <li>a link to confirm this address, only when someone signs up with it;</li>
          <li>a password reset link, only when someone asks for one.</li>
        </ul>
        <p>You can turn off every optional mail to this address now: alert email and settings test messages.</p>
        <form method="post">
          <input type="hidden" name="scope" value="optional">
          <button type="submit">Turn off all optional mail</button>
        </form>
        <p class="small">${deleteAccountLine()}</p>
      `,
    };
  }
  return {
    title: 'Unsubscribe from SafeOS Guardian email',
    body: `
      <h1>Unsubscribe from SafeOS Guardian alert email?</h1>
      <p>This stops alert email and settings test messages to the address this link was sent to. They are the only optional mail SafeOS Guardian sends, so this turns off every optional mail.</p>
      <form method="post">
        <input type="hidden" name="scope" value="optional">
        <button type="submit">Unsubscribe</button>
      </form>
      <p class="small">No mail is sent to confirm it.</p>
    `,
  };
}

function donePage(category: MailCategory): { title: string; body: string } {
  if (isRequiredCategory(category)) {
    return {
      title: 'Optional mail is off',
      body: `
        <h1>Optional mail is off</h1>
        <p>You are unsubscribed from every optional mail SafeOS Guardian sends to this address.</p>
        <p>Account mail still comes only when it is asked for: a link to confirm this address when someone signs up with it, and a password reset link when someone asks for one.</p>
        <p class="small">${deleteAccountLine()}</p>
      `,
    };
  }
  return {
    title: 'You are unsubscribed',
    body: `
      <h1>You are unsubscribed</h1>
      <p>SafeOS Guardian sends no more optional mail to this address: no alert email and no settings test messages.</p>
    `,
  };
}

function gonePage(): { title: string; body: string } {
  return {
    title: 'This link no longer works',
    body: `
      <h1>This link no longer works</h1>
      <p>Nothing was changed. Use the Unsubscribe link in a newer mail, or ask whoever runs this SafeOS Guardian server.</p>
    `,
  };
}

function errorPage(): { title: string; body: string } {
  return {
    title: 'Something went wrong',
    body: `
      <h1>Something went wrong</h1>
      <p>Nothing was changed. Try the link again in a minute.</p>
    `,
  };
}

/** SafeOS Guardian has no self-serve account deletion; the operator deletes accounts. */
function deleteAccountLine(): string {
  const contact = operatorAddress();
  return contact
    ? `To delete your account, and this address with it, write to whoever runs this SafeOS Guardian server at <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>.`
    : 'To delete your account, and this address with it, ask whoever runs this SafeOS Guardian server.';
}

function operatorAddress(): string | null {
  const replyTo = process.env['EMAIL_REPLY_TO']?.trim();
  if (!replyTo) return null;
  const address = replyTo.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? replyTo;
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(address) ? address : null;
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f8fafc;
    --card: #ffffff;
    --text: #1a1f24;
    --muted: #4b5563;
    --border: #e5e7eb;
    --accent: #047857;
    --accent-text: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b1120;
      --card: #111827;
      --text: #f3f4f6;
      --muted: #cbd5e1;
      --border: #1f2937;
      --accent: #10b981;
      --accent-text: #052e1b;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 48px 16px; }
  .brand { font-weight: 700; margin: 0 0 16px; color: var(--text); }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
  h1 { font-size: 22px; line-height: 1.3; margin: 0 0 12px; }
  p, li { color: var(--muted); margin: 0 0 12px; }
  ul { margin: 0 0 12px; padding-left: 20px; }
  .small { font-size: 15px; margin: 16px 0 0; }
  a { color: var(--accent); }
  form { margin: 16px 0 0; }
  button { width: 100%; min-height: 44px; padding: 12px 20px; border: 0; border-radius: 8px; background: var(--accent); color: var(--accent-text); font: inherit; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
<main>
  <p class="brand">SafeOS Guardian</p>
  <div class="card">${body}</div>
</main>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
