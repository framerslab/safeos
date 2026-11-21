/**
 * Error page
 *
 * Shown in place of a page that fails as it draws. A missing script file from
 * an older build reloads the page once for the newest build; any other error
 * says what happened, with a Reload key, a link home and the error's own words
 * for a report, instead of the blank page Next.js leaves without one.
 *
 * @module app/error
 */

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { reloadForNewBuild } from '@/lib/recover-from-stale-build';

export default function ErrorPage({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (reloadForNewBuild(error)) {
      setReloading(true);
      return;
    }
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen pt-24 pb-16">
      <div className="max-w-xl mx-auto px-6 text-center">
        {reloading ? (
          <p role="status" className="text-lg text-[var(--color-steel-200)]">
            Loading the newest version of SafeOS.
          </p>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-[var(--color-steel-100)] mb-4">
              This page stopped working
            </h1>
            <p className="text-[var(--color-steel-300)] text-lg leading-relaxed mb-8">
              Reload it to try again.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="key key--solid"
              >
                Reload
              </button>
              <Link
                href="/"
                className="link-row"
              >
                Go to the home page
              </Link>
            </div>
            <details className="mt-10 text-left text-base text-[var(--color-steel-300)]">
              <summary className="cursor-pointer min-h-[44px] flex items-center">What went wrong</summary>
              <p className="mt-2 font-mono break-words text-[var(--color-steel-100)]">{error.message || error.name}</p>
              <a
                href="https://github.com/framerslab/safeos/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-[44px] underline underline-offset-4"
              >
                Report it on GitHub
              </a>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
