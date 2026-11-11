'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useDetectionModel } from '@/lib/detection-model';

interface ModelDownloadProgressProps {
  /** Kept for callers; never grants download agreement. */
  autoStart?: boolean;
  onReady?: () => void;
  onError?: (error: string) => void;
  compact?: boolean;
  className?: string;
}

/** Download the one model used by Security and Wildlife, after agreement. */
export function ModelDownloadProgress({ onReady, onError, compact, className = '' }: ModelDownloadProgressProps) {
  const { status, error, saved, setupComplete, download } = useDetectionModel();
  useEffect(() => { if (status === 'ready') onReady?.(); }, [status, onReady]);
  useEffect(() => { if (error) onError?.(error); }, [error, onError]);

  return (
    <section aria-label="Detection model" className={`rounded-xl border border-slate-700 bg-slate-800/50 ${compact ? 'p-3' : 'p-6'} ${className}`}>
      <h3 className="font-medium text-white">Person and animal detection</h3>
      <p className="mt-2 text-sm text-slate-400">
        Security and Wildlife share COCO-SSD. Download about 19 MB from Google model storage.
        Detection runs on this device; camera frames are not part of the download.
      </p>
      {!setupComplete ? (
        <Link href="/setup/" className="mt-4 inline-block text-emerald-400 underline">Complete setup before downloading</Link>
      ) : status === 'ready' ? (
        saved ? (
          <p role="status" className="mt-3 text-emerald-400">Detection model ready. Saved for offline use unless browser storage is cleared or evicted.</p>
        ) : (
          <p role="status" className="mt-3 text-amber-300">Detection model ready. It could not be saved in this browser, so the next start downloads it again and needs a connection.</p>
        )
      ) : status === 'loading' ? (
        <p role="status" className="mt-3 text-slate-300">Downloading and loading detection model…</p>
      ) : (
        <>
          {error && <p role="alert" className="mt-3 text-red-300">Download failed: {error}</p>}
          <button type="button" onClick={download} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
            {status === 'error' ? 'Retry model download' : 'Download detection model'}
          </button>
        </>
      )}
    </section>
  );
}

export function ModelStatusBadge({ className = '' }: { className?: string }) {
  const { status } = useDetectionModel();
  return <span className={`text-xs text-slate-300 ${className}`}>Model: {status === 'idle' ? 'Not downloaded' : status}</span>;
}
