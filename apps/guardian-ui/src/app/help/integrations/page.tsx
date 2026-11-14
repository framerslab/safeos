/**
 * Integrations Help Index
 *
 * Lists every optional integration with a one-line description and a link
 * to its dedicated setup guide. The PWA itself requires zero integrations
 * — everything here is opt-in and runs through the optional API server.
 *
 * @module app/help/integrations/page
 */

import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';
import {
  IconMail,
  IconPhone,
  IconMessageSquare,
  IconBell,
  IconCpu,
  IconShield,
} from '@/components/icons';

export const metadata: Metadata = pageMetadata({
  title: 'Integrations',
  description:
    'Setup guides for Resend email, Twilio SMS, Telegram, browser push, and Ollama in SafeOS Guardian.',
  path: '/help/integrations/',
});

interface Integration {
  href: string;
  title: string;
  one_liner: string;
  icon: React.ReactNode;
  status: 'free' | 'paid' | 'free-tier';
}

const INTEGRATIONS: Integration[] = [
  {
    href: '/help/integrations/resend',
    title: 'Resend email',
    one_liner: 'Severity-routed email alerts to any address you configure. Free 3,000 emails/month.',
    icon: <IconMail size={20} />,
    status: 'free-tier',
  },
  {
    href: '/help/integrations/twilio',
    title: 'Twilio SMS',
    one_liner: 'Text-message alerts for high/critical events. Pay-as-you-go (~$0.01/message).',
    icon: <IconPhone size={20} />,
    status: 'paid',
  },
  {
    href: '/help/integrations/telegram',
    title: 'Telegram bot',
    one_liner: 'Fan-out alerts to a Telegram chat. Free, unlimited.',
    icon: <IconMessageSquare size={20} />,
    status: 'free',
  },
  {
    href: '/help/integrations/push',
    title: 'Browser push (VAPID)',
    one_liner: 'OS-level notifications even when SafeOS is closed. Self-host with VAPID keys.',
    icon: <IconBell size={20} />,
    status: 'free',
  },
  {
    href: '/help/integrations/ollama',
    title: 'Ollama local LLM',
    one_liner: 'Run a local vision model (moondream, llava) for richer scene reasoning. Free, runs on your hardware.',
    icon: <IconCpu size={20} />,
    status: 'free',
  },
];

const STATUS_LABELS: Record<Integration['status'], { text: string; cls: string }> = {
  free: { text: 'Free', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  'free-tier': { text: 'Free tier', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  paid: { text: 'Pay-as-you-go', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
};

export default function IntegrationsIndexPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/help"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to Help
        </Link>

        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Integrations</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            SafeOS Guardian runs offline by default. Every integration on this page is{' '}
            <strong className="text-emerald-300">optional</strong> and adds either better delivery
            (SMS, email, Telegram) or smarter scene understanding (Ollama). Browser push is the only
            channel that works without a monitoring server.
          </p>
        </header>

        <div className="mb-6 p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <div className="flex items-start gap-3">
            <IconShield size={20} className="text-emerald-300 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-300 leading-relaxed">
              <p className="font-semibold text-white mb-1">Where your keys live</p>
              <p>
                A key the operator sets in <code className="px-1 py-0.5 bg-slate-900 rounded">.env</code> on
                the API server stays on that server. For Resend, the server sends alert email with it
                only for the operator&apos;s own account. A Resend key you type in Settings →
                Notifications is sent with the test email and is not saved.
              </p>
            </div>
          </div>
        </div>

        <ul className="space-y-3">
          {INTEGRATIONS.map((integration) => (
            <li key={integration.href}>
              <Link
                href={integration.href}
                className="group block p-5 bg-slate-800/40 border border-slate-700/50 hover:border-emerald-500/40 rounded-xl transition-colors"
              >
                <div className="flex items-start gap-4">
                  <span className="w-10 h-10 flex-shrink-0 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-300 group-hover:bg-emerald-500/25 transition-colors">
                    {integration.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h2 className="text-base sm:text-lg font-semibold text-white">{integration.title}</h2>
                      <span
                        className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${STATUS_LABELS[integration.status].cls}`}
                      >
                        {STATUS_LABELS[integration.status].text}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{integration.one_liner}</p>
                  </div>
                  <svg
                    className="w-4 h-4 text-slate-500 group-hover:text-emerald-300 transition-colors flex-shrink-0 mt-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 p-4 bg-slate-800/30 border border-slate-700/40 rounded-xl text-sm text-slate-300 leading-relaxed">
          <p>
            Most of what SafeOS Guardian does — object detection, audio analysis, lost &amp; found
            matching — runs in your browser with no integration at all. See the{' '}
            <Link href="/" className="text-emerald-300 underline-offset-2 hover:underline">
              landing page
            </Link>{' '}
            for the on-device pipeline overview.
          </p>
        </div>
      </div>
    </div>
  );
}
