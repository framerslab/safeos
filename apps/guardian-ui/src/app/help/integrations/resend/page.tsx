/**
 * Resend Integration Help Page
 *
 * End-to-end setup walkthrough for the Resend email integration:
 * - What it powers
 * - How to get an API key
 * - Server-wide vs BYO key
 * - Verifying it works
 * - Troubleshooting
 *
 * @module app/help/integrations/resend/page
 */

import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { IconMail, IconExternalLink, IconWarning, IconCheck, IconShield } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Resend email setup',
  description: 'Configure Resend in SafeOS Guardian for severity-routed alert email.',
  alternates: { canonical: '/help/integrations/resend/' },
};

export default function ResendHelpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/help/integrations"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          All integrations
        </Link>

        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-300">
              <IconMail size={20} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Resend email setup</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Resend sends severity-routed alert emails (medium / high / critical) to any address you
            configure. Free tier gives you 3,000 emails a month — plenty for personal monitoring.
          </p>
        </header>

        {/* ─────── What you need ─────────────────────────────────────────── */}
        <Card title="What you need">
          <ul className="list-disc list-inside text-sm text-slate-300 space-y-1.5 leading-relaxed">
            <li>A Resend account — free at <ExternalLink href="https://resend.com">resend.com</ExternalLink>.</li>
            <li>
              A domain you can add DNS records to (e.g. <code className="px-1 py-0.5 bg-slate-900 rounded">yourdomain.com</code>),
              OR Resend&apos;s onboarding sandbox if you just want to try it.
            </li>
            <li>One Resend API key (created in the Resend dashboard).</li>
          </ul>
        </Card>

        {/* ─────── Step 1 ────────────────────────────────────────────────── */}
        <Card title="1. Verify a sending domain" stepNumber={1}>
          <p className="text-sm text-slate-300 leading-relaxed mb-3">
            In the Resend dashboard, open <strong>Domains → Add Domain</strong> and follow the DNS
            instructions (SPF + DKIM TXT records). Resend usually verifies within a few minutes once
            DNS propagates.
          </p>
          <Callout tone="info">
            <strong>Skipping verification?</strong> You can send from{' '}
            <code className="px-1 py-0.5 bg-slate-900 rounded">onboarding@resend.dev</code> without
            verifying a domain — useful for testing, but recipients may see a warning header.
          </Callout>
        </Card>

        {/* ─────── Step 2 ────────────────────────────────────────────────── */}
        <Card title="2. Create an API key" stepNumber={2}>
          <p className="text-sm text-slate-300 leading-relaxed mb-3">
            Open <ExternalLink href="https://resend.com/api-keys">resend.com/api-keys</ExternalLink>{' '}
            → <strong>Create API Key</strong>. Give it <strong>Sending access</strong> (the
            most-restrictive option). Copy the key — it starts with{' '}
            <code className="px-1 py-0.5 bg-slate-900 rounded">re_</code> and is shown <em>once</em>.
          </p>
        </Card>

        {/* ─────── Step 3 ────────────────────────────────────────────────── */}
        <Card title="3. Choose where the key lives" stepNumber={3}>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            SafeOS Guardian supports two patterns. Pick whichever fits your deployment.
          </p>

          <div className="space-y-4">
            <div className="p-4 bg-slate-900/40 border border-slate-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Recommended
                </span>
                <h3 className="font-semibold text-white">Server-wide key (operator pays)</h3>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-3">
                Set these four values on your API server&apos;s <code>.env</code> file. Every user
                of the deployment can then opt in to email alerts without supplying their own key.
              </p>
              <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto text-slate-300">
{`RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM="SafeOS Guardian <alerts@yourdomain.com>"
EMAIL_REPLY_TO="team@yourdomain.com"
SAFEOS_API_PUBLIC_URL=https://safeos-api.yourdomain.com`}
              </pre>
              <p className="text-xs text-slate-400 mt-2">
                <code>SAFEOS_API_PUBLIC_URL</code> is the https address of your API server. Every
                email&apos;s Unsubscribe link points there, so the server sends no email until it is
                set (behind the bundled Caddy, <code>SAFEOS_DOMAIN</code> is enough).
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Restart your API server after editing. The setting takes effect immediately.
              </p>
            </div>

            <div className="p-4 bg-slate-900/40 border border-slate-700 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  BYO key
                </span>
                <h3 className="font-semibold text-white">Bring your own key (per-user)</h3>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-3">
                Go to{' '}
                <Link
                  href="/settings/notifications"
                  className="text-emerald-300 underline-offset-2 hover:underline"
                >
                  Settings → Notifications
                </Link>
                , enable email alerts, and toggle <strong>Use my own Resend account</strong>. Paste
                your API key + a sender address from a domain you verified in your Resend account.
                The key is stored in this browser&apos;s local storage and only sent to the API server
                when an alert fires.
              </p>
              <Callout tone="info">
                Your key stays in <strong>this browser&apos;s local storage</strong> and is only sent
                to the API server when an alert fires. You can remove it any time from{' '}
                Settings → Notifications.
              </Callout>
            </div>
          </div>
        </Card>

        {/* ─────── Step 4 ────────────────────────────────────────────────── */}
        <Card title="4. Test the integration" stepNumber={4}>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2 leading-relaxed mb-3">
            <li>
              Open{' '}
              <Link href="/settings/notifications" className="text-emerald-300 underline-offset-2 hover:underline">
                Settings → Notifications
              </Link>
              .
            </li>
            <li>Toggle <strong>Enable email alerts</strong>.</li>
            <li>Enter the address you want alerts sent to.</li>
            <li>
              Click <strong>Send test email</strong>. You should get a confirmation message and
              receive the email within a few seconds.
            </li>
          </ol>
          <Callout tone="success">
            <IconCheck size={16} className="inline-block mr-1.5 -mt-0.5" />
            If the test email arrives, you&apos;re done. Real alerts at <strong>medium</strong>,{' '}
            <strong>high</strong>, and <strong>critical</strong> severity will go to the same
            address automatically.
          </Callout>
        </Card>

        {/* ─────── Unsubscribe ──────────────────────────────────────────── */}
        <Card title="The Unsubscribe link in every email">
          <ul className="list-disc list-inside text-sm text-slate-300 space-y-1.5 leading-relaxed">
            <li>
              Every email the API server sends (alerts, the test message, account verification and
              password reset) ends with an <strong>Unsubscribe</strong> link and carries the{' '}
              <code>List-Unsubscribe</code> and <code>List-Unsubscribe-Post</code> headers, so mail
              apps can show their own unsubscribe button (
              <ExternalLink href="https://datatracker.ietf.org/doc/html/rfc8058">RFC 8058</ExternalLink>).
            </li>
            <li>
              Opening the link shows a page that asks and changes nothing. Its button, or a mail
              app&apos;s one-click unsubscribe, stops the email at once. No email is sent to confirm it.
            </li>
            <li>
              Alert email and test messages stop for that address. Account email is sent only when
              someone asks for it; its link turns off every optional email and says what still comes.
            </li>
            <li>
              To stop all email to an address, account email included, run{' '}
              <code>docker compose exec -T api npx tsx src/cli/mail-suppress.ts &lt; addresses.txt</code>{' '}
              (one address per line). When a person who unsubscribed asks for email again, the same
              command with <code>--resubscribe</code> lifts their unsubscribe; a manual stop stays.
            </li>
            <li>
              Mail apps act on the one-click header only when your domain&apos;s DKIM signature covers
              both headers. Open a received email&apos;s original source and check that the{' '}
              <code>h=</code> list of its <code>DKIM-Signature</code> includes{' '}
              <code>list-unsubscribe</code> and <code>list-unsubscribe-post</code>.
            </li>
          </ul>
        </Card>

        {/* ─────── Severity routing ─────────────────────────────────────── */}
        <Card title="Which alerts go to email?">
          <p className="text-sm text-slate-300 leading-relaxed mb-3">
            SafeOS Guardian routes alerts by severity. The default policy:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Severity</th>
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Browser push</th>
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Email</th>
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">SMS</th>
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Telegram</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                <SeverityRow severity="info" email={false} sms={false} telegram={false} push />
                <SeverityRow severity="low" email={false} sms={false} telegram={false} push />
                <SeverityRow severity="medium" email sms={false} telegram push />
                <SeverityRow severity="high" email sms telegram push />
                <SeverityRow severity="critical" email sms telegram push />
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Quiet hours skip delivery of low and medium alerts. High and critical alerts bypass quiet hours.
          </p>
        </Card>

        {/* ─────── Privacy ──────────────────────────────────────────────── */}
        <Card title="Where your data lives">
          <ul className="list-disc list-inside text-sm text-slate-300 space-y-1.5 leading-relaxed">
            <li>
              The Resend API key (when BYO) sits in this browser&apos;s local storage. It stays
              in this browser until you click <em>Send test email</em> or an alert fires.
            </li>
            <li>
              Email content is rendered server-side and POSTed to Resend over HTTPS. SafeOS keeps
              no copy of the email body after dispatch.
            </li>
            <li>
              The recipient address is stored on your profile (and locally). Change or clear it at
              any time from the settings page.
            </li>
            <li>
              For the Unsubscribe link, the server keeps the SHA-256 of the recipient address and of
              the link&apos;s token, never the address itself.
            </li>
            <li>
              Frame does not receive copies of your alert emails. The path is{' '}
              <code>your browser → your SafeOS API server → Resend → your inbox</code>.
            </li>
          </ul>
        </Card>

        {/* ─────── Troubleshooting ──────────────────────────────────────── */}
        <Card title="Troubleshooting">
          <dl className="space-y-4 text-sm">
            <Trouble q="The test email button is disabled.">
              Check that (a) the toggle is on, (b) the recipient field is a valid email, and (c)
              either the server reports Resend as configured (badge on this page) or you&apos;ve
              entered your own API key.
            </Trouble>
            <Trouble q={'The test says "Email not configured" although my key is set.'}>
              Every email carries an Unsubscribe link back to your API server, so the server needs
              its own https address. Set <code>SAFEOS_API_PUBLIC_URL</code> (or{' '}
              <code>SAFEOS_DOMAIN</code> behind the bundled Caddy) and restart the server.
            </Trouble>
            <Trouble q={'The test says the address unsubscribed.'}>
              Someone used the Unsubscribe link in an email to that address, so SafeOS Guardian
              sends it no more alert or test email. If it was you, ask whoever runs the server to
              run the <code>mail-suppress</code> command with <code>--resubscribe</code> for your
              address, or use another address.
            </Trouble>
            <Trouble q={'I get "Resend send failed: From address not authorized".'}>
              Your <code>From</code> address must use a domain that&apos;s verified in your Resend
              account. Either verify the domain or fall back to{' '}
              <code>onboarding@resend.dev</code>.
            </Trouble>
            <Trouble q="I'm not receiving alert emails even though the test worked.">
              Confirm the alert severity is at least <strong>medium</strong> — info and low events
              never go to email by default. Also check spam, and the rate limits in your Resend
              dashboard.
            </Trouble>
            <Trouble q="I want different sender names per scenario.">
              Not currently supported — every alert uses the same{' '}
              <code>EMAIL_FROM</code> (server) or sender override (BYO). Open an issue if you need
              per-stream sender routing.
            </Trouble>
            <Trouble q="Where do I see Resend errors?">
              Server logs print <code>[NotificationManager]</code> and{' '}
              <code>Resend send failed: …</code> lines. The Resend dashboard&apos;s{' '}
              <strong>Logs</strong> tab shows every send attempt with delivery state.
            </Trouble>
          </dl>
        </Card>

        <div className="mt-6 p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl text-sm text-slate-300 leading-relaxed">
          Need more depth?{' '}
          <ExternalLink href="https://resend.com/docs">Resend&apos;s docs</ExternalLink> cover
          domains, deliverability, and rate limits in detail.
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// UI helpers
// =============================================================================

function Card({
  title,
  stepNumber,
  children,
}: {
  title: string;
  stepNumber?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
      <h2 className="text-base sm:text-lg font-semibold text-white mb-3 flex items-center gap-2">
        {stepNumber !== undefined && (
          <span className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-300">
            {stepNumber}
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
    >
      {children}
      <IconExternalLink size={12} />
    </a>
  );
}

function Callout({ tone, children }: { tone: 'info' | 'warning' | 'success'; children: React.ReactNode }) {
  const toneCls = {
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-100',
    warning: 'bg-amber-500/10 border-amber-500/40 text-amber-100',
    success: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-100',
  };
  const Icon = tone === 'warning' ? IconWarning : tone === 'success' ? IconCheck : IconShield;
  return (
    <div className={`mt-2 p-3 border rounded-lg text-sm leading-relaxed ${toneCls[tone]}`}>
      <Icon size={16} className="inline-block mr-1.5 -mt-0.5" />
      {children}
    </div>
  );
}

function SeverityRow({
  severity,
  email,
  sms,
  telegram,
  push,
}: {
  severity: string;
  email: boolean;
  sms: boolean;
  telegram: boolean;
  push: boolean;
}) {
  const Cell = ({ on }: { on: boolean }) => (
    <td className="py-2 px-2">{on ? <span className="text-emerald-400">✓</span> : <span className="text-slate-600">—</span>}</td>
  );
  return (
    <tr className="border-b border-slate-800 last:border-0">
      <td className="py-2 px-2 font-medium text-white capitalize">{severity}</td>
      <Cell on={push} />
      <Cell on={email} />
      <Cell on={sms} />
      <Cell on={telegram} />
    </tr>
  );
}

function Trouble({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-white mb-1">{q}</dt>
      <dd className="text-slate-300 leading-relaxed">{children}</dd>
    </div>
  );
}
