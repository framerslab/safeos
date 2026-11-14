/**
 * Not Found Page
 *
 * Shown for an address the site does not have (the static export writes it
 * as 404.html, which GitHub Pages serves for a missing path), in the site's
 * own look and with a way home.
 *
 * @module app/not-found
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { SafeOSLogo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-screen pt-24 pb-16">
      <div className="max-w-xl mx-auto px-6 text-center">
        <SafeOSLogo size={64} className="mx-auto mb-6 text-[var(--color-accent-500)]" />
        <p className="font-mono text-sm uppercase tracking-widest text-[var(--color-steel-400)] mb-3">
          404
        </p>
        <h1 className="text-3xl font-bold text-[var(--color-steel-100)] mb-4">
          This page does not exist
        </h1>
        <p className="text-[var(--color-steel-300)] leading-relaxed mb-8">
          The address may be mistyped, or the page has moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center min-h-[44px] px-5 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors"
          >
            Go to the home page
          </Link>
          <Link
            href="/help/"
            className="inline-flex items-center justify-center min-h-[44px] px-5 border border-[var(--color-steel-700)] text-[var(--color-steel-200)] rounded-lg hover:bg-[var(--color-steel-800)] transition-colors"
          >
            Help
          </Link>
        </div>
      </div>
    </main>
  );
}
