/**
 * Old support address
 *
 * safeos.sh asks for no money. A static export cannot answer this address
 * with an HTTP redirect, so it is a short page that says SafeOS is free and
 * who builds it, links About, and moves the browser on to About when scripts
 * run. It is in neither the sitemap nor the navigation, and asks search
 * engines not to index it.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { ForwardToAbout } from './ForwardToAbout';

export const metadata: Metadata = {
  title: 'SafeOS is free',
  description: 'SafeOS at safeos.sh is free and built by Frame.',
  robots: { index: false, follow: true },
};

export default function OldSupportAddress() {
  return (
    <main className="min-h-screen pt-24 pb-16">
      <ForwardToAbout />
      <div className="max-w-xl mx-auto px-6 text-center">
        <h1 className="text-3xl font-bold text-white mb-4">SafeOS is free</h1>
        <p className="text-slate-300 leading-relaxed mb-8">
          SafeOS at safeos.sh is free, with no account and no paid tier. Frame builds it and pays
          for its development.
        </p>
        <Link
          href="/about/"
          className="inline-flex items-center justify-center min-h-[44px] px-5 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors"
        >
          About SafeOS
        </Link>
      </div>
    </main>
  );
}
