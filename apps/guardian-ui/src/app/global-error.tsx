/**
 * Error page for the whole app
 *
 * Shown when the app's own frame fails, in place of the root layout, so it
 * draws its own html and body with plain styles: the site's stylesheet may be
 * the file that failed. A missing script file from an older build reloads the
 * page once for the newest build; any other error says what happened, with a
 * Reload key, a link home and the error's own words for a report.
 *
 * @module app/global-error
 */

'use client';

import React, { useEffect, useState } from 'react';
import { reloadForNewBuild } from '@/lib/recover-from-stale-build';

const page: React.CSSProperties = {
  margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#0b1220', color: '#e6edf3', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
};
const key: React.CSSProperties = {
  minHeight: 44, padding: '0 20px', fontSize: 18, border: 0, borderRadius: 8, background: '#047857', color: '#ffffff', cursor: 'pointer',
};

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (reloadForNewBuild(error)) {
      setReloading(true);
      return;
    }
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={page}>
        <main style={{ maxWidth: 560, padding: '0 24px', textAlign: 'center' }}>
          {reloading ? (
            <p role="status" style={{ fontSize: 18 }}>Loading the newest version of SafeOS.</p>
          ) : (
            <>
              <h1 style={{ fontSize: 30, margin: '0 0 16px' }}>This page stopped working</h1>
              <p style={{ fontSize: 18, lineHeight: 1.6, margin: '0 0 32px', color: '#c9d4df' }}>
                Reload it to try again.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" style={key} onClick={() => window.location.reload()}>Reload</button>
                {/* A plain link: the app's router may be what failed. */}
                <a href="/" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 18, color: '#e6edf3' }}>
                  Go to the home page
                </a>
              </div>
              <details style={{ marginTop: 40, textAlign: 'left', fontSize: 16, color: '#c9d4df' }}>
                <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>What went wrong</summary>
                <p style={{ margin: '8px 0', fontFamily: 'ui-monospace, Menlo, monospace', overflowWrap: 'anywhere', color: '#e6edf3' }}>
                  {error.message || error.name}
                </p>
                <a href="https://github.com/framerslab/safeos/issues/new" target="_blank" rel="noopener noreferrer" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', color: '#e6edf3' }}>
                  Report it on GitHub
                </a>
              </details>
            </>
          )}
        </main>
      </body>
    </html>
  );
}
