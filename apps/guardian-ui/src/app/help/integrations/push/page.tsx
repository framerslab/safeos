/**
 * Browser Push (VAPID) Integration Help
 *
 * Setup walkthrough for self-hosted browser push notifications via VAPID.
 *
 * @module app/help/integrations/push/page
 */

import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { IconBell, IconExternalLink, IconShield } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Browser push setup',
  description: 'Configure VAPID keys for SafeOS Guardian browser push notifications.',
  alternates: { canonical: '/help/integrations/push/' },
};

export default function PushHelpPage() {
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
              <IconBell size={20} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Browser push (VAPID)</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Browser push lets SafeOS Guardian wake the OS notification center even when the app
            isn&apos;t in focus. The PWA can show in-tab notifications without any server setup; this
            page covers <strong>backgrounded</strong> push, which needs VAPID keys on the API
            server.
          </p>
        </header>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Generate VAPID keys</h2>
          <p className="text-sm text-slate-300 leading-relaxed mb-3">
            VAPID keys identify your server to the browser&apos;s push service (Mozilla, Apple,
            Google). Generate a pair with the <code>web-push</code> CLI (already a SafeOS
            dependency):
          </p>
          <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto text-slate-300">
{`npx web-push generate-vapid-keys`}
          </pre>
          <p className="text-sm text-slate-300 leading-relaxed mt-3 mb-3">
            Then add them to your API server&apos;s <code className="px-1 py-0.5 bg-slate-900 rounded">.env</code>:
          </p>
          <pre className="text-xs bg-slate-950 border border-slate-800 rounded p-3 overflow-x-auto text-slate-300">
{`VAPID_PUBLIC_KEY=BPxxxxxx...
VAPID_PRIVATE_KEY=xxxxxx...
VAPID_EMAIL=admin@yourdomain.com`}
          </pre>
          <p className="text-xs text-slate-400 mt-2">
            <code>VAPID_EMAIL</code> is contact info for the push service — use a real address.
          </p>
        </section>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">User-side opt-in</h2>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2 leading-relaxed">
            <li>Open SafeOS in a browser that supports push (Chrome, Edge, Firefox, Safari 16+).</li>
            <li>
              Accept the notification permission prompt when it appears (or open{' '}
              <Link href="/settings/notifications" className="text-emerald-300 underline-offset-2 hover:underline">
                Settings → Notifications
              </Link>{' '}
              and enable browser push manually).
            </li>
            <li>
              For best results on mobile, install the PWA: <em>Add to Home Screen</em> on iOS, or
              <em> Install app</em> on Android.
            </li>
          </ol>
        </section>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <div className="flex items-start gap-3">
            <IconShield size={18} className="text-emerald-300 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">iOS limitations</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Apple supports web push only when the PWA is installed to the home screen and only
                in iOS 16.4+. Background push <strong>cannot</strong> work in a normal Safari tab.
                If a user can&apos;t install, fall back to email or SMS alerts.
              </p>
            </div>
          </div>
        </section>

        <p className="text-xs text-slate-400">
          Reference:{' '}
          <a
            href="https://web.dev/articles/push-notifications-overview"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
          >
            web.dev push notifications overview
            <IconExternalLink size={12} />
          </a>
          .
        </p>
      </div>
    </div>
  );
}
