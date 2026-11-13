/**
 * Telegram Integration Help
 *
 * Personal bot setup for Telegram alerts.
 *
 * @module app/help/integrations/telegram/page
 */

import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';
import { IconMessageSquare, IconExternalLink } from '@/components/icons';

export const metadata: Metadata = pageMetadata({
  title: 'Telegram setup',
  description:
    'Configure your own Telegram bot for SafeOS Guardian alerts.',
  path: '/help/integrations/telegram/',
});

export default function TelegramHelpPage() {
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
              <IconMessageSquare size={20} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Telegram bot setup</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Save your own Telegram bot token in your SafeOS profile. Your bot delivers alerts
            to your registered chats at <strong>medium</strong> severity and above.
            The shared server bot does not deliver these alerts.
          </p>
        </header>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Create your bot</h2>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2 leading-relaxed">
            <li>
              Open Telegram and message{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
              >
                @BotFather
                <IconExternalLink size={12} />
              </a>
              . Send <code>/newbot</code>.
            </li>
            <li>Choose a display name and a username ending in <code>_bot</code>.</li>
            <li>BotFather replies with an HTTP API token — copy it.</li>
            <li>
              Keep the token private. Save it as <code>notificationSettings.telegramBotToken</code>
              {' '}through the authenticated <code>PATCH /api/auth/profile</code> route.
            </li>
          </ol>
          <p className="text-xs text-slate-400 mt-2">
            The API stores the token without returning it in profile responses. Clear it by saving an empty string.
          </p>
        </section>

        <section className="mb-5 p-5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
          <h2 className="text-base sm:text-lg font-semibold text-white mb-3">Register your chat</h2>
          <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2 leading-relaxed">
            <li>Search for your bot by username in Telegram and tap <strong>Start</strong>.</li>
            <li>
              Use your bot to find your chat ID, then save it with the authenticated
              {' '}<code>POST /api/notifications/telegram/register</code> route as <code>chatId</code>.
              Each chat belongs to your signed-in profile.
            </li>
            <li>
              Toggle <strong>Send Telegram alerts</strong> in{' '}
              <Link href="/settings/notifications" className="text-emerald-300 underline-offset-2 hover:underline">
                Settings → Notifications
              </Link>
              .
            </li>
            <li>Confirm delivery with a monitoring alert at medium severity or above.</li>
          </ol>
        </section>

        <p className="text-xs text-slate-400">
          Reference:{' '}
          <a
            href="https://core.telegram.org/bots"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline"
          >
            Telegram Bot API docs
          </a>
          .
        </p>
      </div>
    </div>
  );
}
