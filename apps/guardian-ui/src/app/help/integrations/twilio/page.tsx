/**
 * Twilio SMS Integration Help
 *
 * Server-operator setup for Twilio SMS alerts.
 *
 * @module app/help/integrations/twilio/page
 */

import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { IconPhone, IconExternalLink, IconWarning } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Twilio SMS setup',
  description: 'Configure Twilio SMS alerts on your SafeOS Guardian API server.',
  alternates: { canonical: '/help/integrations/twilio/' },
};

export default function TwilioHelpPage() {
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
              <IconPhone size={20} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Twilio SMS setup</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Twilio delivers SMS for <strong>high</strong> and <strong>critical</strong> severity
            events. Configuration is server-side only — there&apos;s no per-user Twilio key field.
            Sign up at{' '}
            <a
              href="https://www.twilio.com/try-twilio"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
            >
              twilio.com
              <IconExternalLink size={12} />
            </a>{' '}
            and budget around $0.0079/SMS in the US.
          </p>
        </header>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Setup</h2>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2 leading-relaxed">
            <li>Create a Twilio account and verify your identity.</li>
            <li>Buy a phone number (one-time ~$1/month).</li>
            <li>
              From the Twilio Console, copy your <strong>Account SID</strong> and{' '}
              <strong>Auth Token</strong>.
            </li>
            <li>
              Add these to your API server&apos;s <code className="px-1 py-0.5 bg-slate-900 rounded">.env</code>:
            </li>
          </ol>
          <pre className="mt-3 text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto text-slate-300">
{`TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+15555555555`}
          </pre>
          <p className="text-xs text-slate-400 mt-2">Restart the API server for the change to take effect.</p>
        </section>

        <section className="mb-5 p-5 bg-amber-500/10 border border-amber-500/40 rounded-xl">
          <div className="flex items-start gap-3">
            <IconWarning size={20} className="text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-100 leading-relaxed">
              <p className="font-semibold mb-1">Trial accounts can only send to verified numbers</p>
              <p>
                Twilio trial accounts require you to verify each recipient phone number in the
                Console first. Upgrade to a paid account to remove this restriction.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Verify it works</h2>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2 leading-relaxed">
            <li>
              Open{' '}
              <Link href="/settings/notifications" className="text-emerald-300 underline-offset-2 hover:underline">
                Settings → Notifications
              </Link>
              . The SMS row should show <strong>configured: yes</strong>.
            </li>
            <li>
              Toggle <strong>Send SMS alerts</strong> on, then go to{' '}
              <Link href="/settings/test-alerts" className="text-emerald-300 underline-offset-2 hover:underline">
                Settings → Test alerts
              </Link>{' '}
              and fire a high-severity test.
            </li>
            <li>Check your phone within ~30 seconds.</li>
          </ol>
        </section>

        <p className="text-xs text-slate-400">
          Reference:{' '}
          <a
            href="https://www.twilio.com/docs/sms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline"
          >
            Twilio SMS docs
          </a>
          .
        </p>
      </div>
    </div>
  );
}
