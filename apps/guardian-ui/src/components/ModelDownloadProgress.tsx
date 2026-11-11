/**
 * Model Download Progress Component
 *
 * Shows download progress for Transformers.js AI models.
 * Displays percentage, MB downloaded/total, and status messages.
 * Models are cached in IndexedDB after first download.
 *
 * @module components/ModelDownloadProgress
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useBrowserVision, type ModelProgress } from '@/lib/browser-vision-analyzer';

// =============================================================================
// Types
// =============================================================================

interface ModelDownloadProgressProps {
  /** Auto-start model download on mount */
  autoStart?: boolean;
  /** Callback when model is ready */
  onReady?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Show compact inline version */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Status Messages
// =============================================================================

const STATUS_MESSAGES: Record<ModelProgress['status'], string> = {
  idle: 'AI model not loaded',
  downloading: 'Downloading AI model...',
  loading: 'Loading AI model...',
  ready: 'AI model ready',
  error: 'Failed to load AI model',
};

// =============================================================================
// Component
// =============================================================================

export function ModelDownloadProgress({
  autoStart = false,
  onReady,
  onError,
  compact = false,
  className = '',
}: ModelDownloadProgressProps) {
  const { isReady, isLoading, progress, error, initialize } = useBrowserVision(autoStart);
  const [dismissed, setDismissed] = useState(false);

  // Notify parent when ready
  useEffect(() => {
    if (isReady) {
      onReady?.();
    }
  }, [isReady, onReady]);

  // Notify parent on error
  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  // Keep the initial download action visible.
  if (isReady && dismissed) {
    return null;
  }

  // Compact inline version
  if (compact) {
    return (
      <CompactProgress
        progress={progress}
        isLoading={isLoading}
        error={error}
        onStart={initialize}
        className={className}
      />
    );
  }

  // Full progress card
  return (
    <FullProgress
      progress={progress}
      isLoading={isLoading}
      isReady={isReady}
      error={error}
      onStart={initialize}
      onDismiss={() => setDismissed(true)}
      className={className}
    />
  );
}

// =============================================================================
// Compact Progress (Inline)
// =============================================================================

interface CompactProgressProps {
  progress: ModelProgress;
  isLoading: boolean;
  error: string | null;
  onStart: () => void;
  className?: string;
}

function CompactProgress({ progress, isLoading, error, onStart, className }: CompactProgressProps) {
  const { status } = progress;

  // Idle state - show load button
  if (status === 'idle') {
    return (
      <button
        onClick={onStart}
        disabled={isLoading}
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors ${className}`}
      >
        <AIIcon className="w-4 h-4" />
        Load AI Model
      </button>
    );
  }

  // Downloading/Loading state
  if (status === 'downloading' || status === 'loading') {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-500/10 rounded-lg ${className}`}>
        <Spinner className="w-4 h-4 text-blue-400" />
        <span className="text-blue-300">{progress.progress}%</span>
        <span className="text-blue-300/60">
          ({progress.downloadedMB.toFixed(1)}/{progress.totalMB.toFixed(1)} MB)
        </span>
      </div>
    );
  }

  // Ready state
  if (status === 'ready') {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-emerald-500/10 rounded-lg ${className}`}>
        <CheckIcon className="w-4 h-4 text-emerald-400" />
        <span className="text-emerald-300">AI Ready</span>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <button
        onClick={onStart}
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors ${className}`}
      >
        <ErrorIcon className="w-4 h-4" />
        Retry
      </button>
    );
  }

  return null;
}

// =============================================================================
// Full Progress Card
// =============================================================================

interface FullProgressProps {
  progress: ModelProgress;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  onStart: () => void;
  onDismiss: () => void;
  className?: string;
}

function FullProgress({
  progress,
  isLoading,
  isReady,
  error,
  onStart,
  onDismiss,
  className,
}: FullProgressProps) {
  const { status } = progress;

  // Idle state - prompt to download
  if (status === 'idle') {
    return (
      <div className={`bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 ${className}`}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-emerald-500/10 rounded-xl">
            <AIIcon className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white mb-1">Enhanced AI Vision</h3>
            <p className="text-xs text-slate-400 mb-4">
              Download the AI model for enhanced scene analysis. The model is cached locally
              after the first download (~{progress.totalMB} MB).
            </p>
            <button
              onClick={onStart}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Download AI Model
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Downloading state
  if (status === 'downloading' || status === 'loading') {
    const progressPercent = Math.min(100, Math.max(0, progress.progress));

    return (
      <div className={`bg-blue-500/5 border border-blue-500/20 rounded-xl p-6 ${className}`}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-blue-500/10 rounded-xl">
            <Spinner className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-white">
                {STATUS_MESSAGES[status]}
              </h3>
              <span className="text-xs font-mono text-blue-300">
                {progressPercent}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-blue-900/50 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{progress.modelName}</span>
              <span>
                {progress.downloadedMB.toFixed(1)} / {progress.totalMB.toFixed(1)} MB
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Ready state
  if (status === 'ready') {
    return (
      <div className={`bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 ${className}`}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-emerald-500/10 rounded-xl">
            <CheckIcon className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white mb-1">AI Model Ready</h3>
            <p className="text-xs text-slate-400">
              Enhanced vision analysis is now available. The model is cached for instant loading next time.
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Dismiss"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className={`bg-red-500/5 border border-red-500/20 rounded-xl p-6 ${className}`}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-red-500/10 rounded-xl">
            <ErrorIcon className="w-6 h-6 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white mb-1">Download Failed</h3>
            <p className="text-xs text-red-300/70 mb-4">
              {progress.error || error || 'Unable to download the AI model. Check your connection and try again.'}
            </p>
            <button
              onClick={onStart}
              className="px-4 py-2 text-sm font-medium text-red-300 hover:text-white bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors"
            >
              Retry Download
            </button>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
            aria-label="Dismiss"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// =============================================================================
// Inline Progress Bar
// =============================================================================

interface InlineProgressBarProps {
  progress: ModelProgress;
  className?: string;
}

export function InlineProgressBar({ progress, className = '' }: InlineProgressBarProps) {
  if (progress.status !== 'downloading' && progress.status !== 'loading') {
    return null;
  }

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
        <span>{STATUS_MESSAGES[progress.status]}</span>
        <span>{progress.progress}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${progress.progress}%` }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Status Badge
// =============================================================================

interface ModelStatusBadgeProps {
  className?: string;
}

export function ModelStatusBadge({ className = '' }: ModelStatusBadgeProps) {
  const { progress } = useBrowserVision();

  const getBadgeStyles = () => {
    switch (progress.status) {
      case 'ready':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'downloading':
      case 'loading':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getIcon = () => {
    switch (progress.status) {
      case 'ready':
        return <CheckIcon className="w-3 h-3" />;
      case 'downloading':
      case 'loading':
        return <Spinner className="w-3 h-3" />;
      case 'error':
        return <ErrorIcon className="w-3 h-3" />;
      default:
        return <AIIcon className="w-3 h-3" />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border rounded-full ${getBadgeStyles()} ${className}`}
    >
      {getIcon()}
      {progress.status === 'downloading' || progress.status === 'loading'
        ? `${progress.progress}%`
        : progress.status === 'ready'
        ? 'AI'
        : progress.status === 'error'
        ? 'Error'
        : 'No AI'}
    </span>
  );
}

// =============================================================================
// Icons
// =============================================================================

function AIIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function ErrorIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CloseIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

// =============================================================================
// Exports
// =============================================================================

export default ModelDownloadProgress;
