/**
 * Privacy Policy Page
 *
 * Emphasizes zero data collection and local-first architecture.
 * No cookies, no tracking, no analytics.
 *
 * @module app/privacy/page
 */

import type { Metadata } from 'next';
import type { ComponentType } from 'react';
import { IconShield, IconLock, IconEye, IconDatabase, IconCheck } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'SafeOS Guardian privacy policy: no tracking, no cookies, local-first by design.',
  alternates: { canonical: '/privacy/' },
};

// =============================================================================
// Privacy Features
// =============================================================================

interface PrivacyFeature {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}

const privacyFeatures: PrivacyFeature[] = [
  {
    icon: IconDatabase,
    title: 'Local-First Storage',
    description: 'Your settings are stored in your browser\'s localStorage, and saved frames and reference photos in its IndexedDB. Without a configured monitoring server, camera frames stay in your browser. If you connect a server you run yourself and choose a processing mode that uses it, the monitor sends camera frames to that server only.',
  },
  {
    icon: IconEye,
    title: 'Zero Tracking',
    description: 'No Google Analytics. No Facebook Pixel. No tracking scripts. We don\'t know who you are, and we like it that way.',
  },
  {
    icon: IconLock,
    title: 'No Cookies',
    description: 'We don\'t use cookies. Not for tracking, not for anything.',
  },
  {
    icon: IconShield,
    title: 'No Data Collection',
    description: 'We collect absolutely nothing. No usage data, no telemetry, no crash reports. Your privacy is non-negotiable.',
  },
];

// =============================================================================
// Page Component
// =============================================================================

export default function PrivacyPage() {
  return (
    <main className="min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
            <IconShield size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white font-[family-name:var(--font-space-grotesk)] mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-slate-400">
            The simplest privacy policy you&apos;ll ever read: <span className="text-emerald-400 font-semibold">We collect nothing.</span>
          </p>
        </div>

        {/* TL;DR Section */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 mb-10">
          <h2 className="text-lg font-semibold text-emerald-400 mb-3 font-[family-name:var(--font-space-grotesk)]">
            TL;DR
          </h2>
          <ul className="space-y-2">
            {[
              'Without a configured server, your camera feed stays on your device',
              'We store nothing on our servers',
              'No accounts, no sign-ups, no tracking',
              'Without a configured server, saved records stay in your browser',
              "Clearing browser data removes only this device’s saved records",
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-slate-300">
                <IconCheck size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Privacy Features */}
        <div className="space-y-6 mb-12">
          {privacyFeatures.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={i}
                className="bg-[rgba(15,20,25,0.6)] border border-white/5 rounded-xl p-6 hover:border-emerald-500/20 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-800/50 flex items-center justify-center flex-shrink-0">
                    <Icon size={24} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2 font-[family-name:var(--font-space-grotesk)]">
                      {feature.title}
                    </h3>
                    <p className="text-slate-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Technical Details */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-4 font-[family-name:var(--font-space-grotesk)]">
            Technical Details
          </h2>
          <div className="prose prose-invert prose-slate max-w-none">
            <div className="text-slate-400 space-y-4">
              <p>
                <strong className="text-white">Camera Access:</strong> Your camera feed is processed 
                entirely within your browser using JavaScript. Frames are analyzed locally using 
                motion detection algorithms and, on the Security and Wildlife pages, the COCO-SSD
                model. Without a configured server, no video leaves your device. If you connect a server you run
                yourself and choose a processing mode that uses it, the monitor page sends camera frames
                to that server.
              </p>
              <p>
                <strong className="text-white">Data Storage:</strong> Your preferences are stored in
                your browser&apos;s local storage. Saved frames from Security, Lost &amp; Found, and
                Wildlife, and your reference photos, are stored in IndexedDB. Alerts on the monitor
                page are saved in IndexedDB and restored in History after a reload.
                Alerts saved in this browser are shown to anyone who uses SafeOS in this browser, until
                someone signs out or clears local data. A session that expires and is replaced does not
                change what is shown. Alerts saved before this update stay until you dismiss them or use the
                existing clear controls, and do not count toward the limits. A SafeOS tab opened before this
                update keeps the earlier limit until it is closed or reloaded: each monitoring alert it saves
                leaves only the newest 100 monitoring alerts. New alerts are limited to 100 monitoring alerts
                and 500 alerts overall in this browser. Acknowledged alerts are removed first, oldest first;
                if all remaining alerts are unacknowledged, the oldest leave first. Alerts are never removed
                because of their age. Records on a configured server are not deleted by clearing browser
                data or signing out. Clear All Local Data also removes recorded sounds and the offline cache.
                Signing out, in any tab, clears the alerts, frames, recordings and personal settings saved in
                this browser, for every tab; the server connection is kept. Another tab that is still open
                may go on showing its alerts until it is reloaded, and it stops receiving alerts from a
                configured server until then.
              </p>
              <p>
                <strong className="text-white">Updates in other tabs:</strong> When SafeOS is updated in
                another tab, this tab stops saving and asks you to reload. If an older tab holds the update
                back, close other SafeOS tabs, then reload this page. While either notice is shown, new
                alerts in this tab are shown but not saved, and acknowledging, dismissing or clearing alerts
                is not saved. The notice does not stop alerts from a configured server: the tab keeps the
                session this browser holds for it and makes no new one, or makes one if it holds none or the
                server has ended the one it holds. One case differs: a session that ran out on this device
                just as the notice came is kept, and alerts from a configured server pause in that tab until
                it is reloaded. Everything already saved comes back as it was after you reload. If an update
                of your saved history cannot finish, the page says so; nothing is deleted, and a reload
                tries again.
              </p>
              <p>
                <strong className="text-white">AI Processing:</strong> When you use AI features, 
                processing happens either in your browser (TensorFlow.js) or via your local Ollama 
                installation. We do not provide cloud AI services. Security and Wildlife download
                the COCO-SSD model from Google&apos;s servers, which see your IP address.
                The GitHub link makes no request until you open it.
              </p>
              <p>
                <strong className="text-white">Do Not Track and Global Privacy Control:</strong> safeos.sh
                runs no tracking, so these signals have nothing to switch off: nothing about you is
                collected whether your browser sends them or not.
              </p>
              <p>
                <strong className="text-white">Hosting:</strong> safeos.sh is hosted on GitHub Pages.
                Like any web host, GitHub logs each visitor&apos;s IP address; it{' '}
                <a
                  href="https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages#data-collection"
                  className="text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  says it stores them for security purposes
                </a>
                .
              </p>
              <p>
                <strong className="text-white">Service Worker:</strong> We use a service worker 
                for offline functionality. It caches app files locally. After you agree to the detection model download, its manifest and weights are saved separately in browser Cache Storage.
                Browser notifications (when enabled) are handled by your browser; true background push
                notifications require additional setup and are not enabled by default.
              </p>
            </div>
          </div>
        </section>

        {/* What We Don't Do */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-4 font-[family-name:var(--font-space-grotesk)]">
            What We Don&apos;t Do
          </h2>
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6">
            <ul className="space-y-3">
              {[
                'Collect personal information',
                'Track your browsing or usage',
                'Sell or share any data (we have none to share)',
                'Use third-party analytics',
                'Store anything on our servers',
                'Require accounts or sign-ups',
                'Use cookies of any kind',
                'Fingerprint your browser',
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-red-400 text-xs">✕</span>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Open Source */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-4 font-[family-name:var(--font-space-grotesk)]">
            Open Source
          </h2>
          <div className="text-slate-400 space-y-4">
            <p>
              Frame builds SafeOS and pays for its development.
            </p>
            <p>
              This project is open source. You can inspect our code, verify our privacy claims, 
              and even self-host if you prefer. Trust, but verify.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-4 font-[family-name:var(--font-space-grotesk)]">
            Questions?
          </h2>
          <p className="text-slate-400">
            safeos.sh is operated by Frame (Framers Lab, Inc.). If you have any privacy concerns or
            questions, reach out at{' '}
            <a
              href="mailto:privacy@frame.dev"
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              privacy@frame.dev
            </a>
          </p>
        </section>

        {/* Last Updated */}
        <div className="text-center text-sm text-slate-500 border-t border-white/5 pt-8">
          Last updated: November 13, 2026
        </div>
      </div>
    </main>
  );
}


























