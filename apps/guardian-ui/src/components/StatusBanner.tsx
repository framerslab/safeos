/**
 * Status Banner Component
 *
 * Shows backend connection status and local-only mode indicator.
 * Allows users to configure backend or dismiss the banner.
 *
 * @module components/StatusBanner
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import { getDatabaseNotice } from '@/lib/client-db';

// =============================================================================
// Types
// =============================================================================

interface StatusBannerProps {
  onConfigureClick?: () => void;
  dismissible?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function StatusBanner({ onConfigureClick, dismissible = true }: StatusBannerProps) {
  const { status, isLocalOnly, retry, config } = useBackendStatus();
  const [isDismissed, setIsDismissed] = useState(false);
  const [databaseNotice, setDatabaseNotice] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setDatabaseNotice(getDatabaseNotice());
    update();
    window.addEventListener('safeos:database-status', update);
    return () => window.removeEventListener('safeos:database-status', update);
  }, []);
  const [isVisible, setIsVisible] = useState(false);

  // Restore dismissed state from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = localStorage.getItem('safeos_status_banner_dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Show banner after mount to prevent hydration mismatch
  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('safeos_status_banner_dismissed', 'true');
    }
  };

  const handleConfigure = () => {
    // Clear dismissed state when user wants to configure
    setIsDismissed(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('safeos_status_banner_dismissed');
      // Fall through to the global handler when no callback was passed —
      // Providers listens for this event and opens the BackendSettings modal.
      if (!onConfigureClick) {
        window.dispatchEvent(new Event('safeos:open-backend-settings'));
      }
    }
    onConfigureClick?.();
  };

  if (!isVisible) {
    return null;
  }

  if (databaseNotice) {
    return (
      <div role="alert" className="bg-amber-900 border-b border-amber-500 text-amber-100">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <p className="text-sm flex-1 min-w-48">{databaseNotice}</p>
          <button type="button" onClick={() => window.location.reload()}
            className="min-h-11 px-3 py-2 rounded-lg bg-amber-300 text-amber-950 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            Reload SafeOS
          </button>
        </div>
      </div>
    );
  }

  // For pure-PWA visitors who never configured a monitoring server, "local-only"
  // is the expected steady state — don't pin a persistent banner about it. Only
  // show the local-only banner when the user has actually tried to connect to
  // a server (config.apiUrl present) and it's not online.
  const shouldShowLocalOnlyBanner = isLocalOnly && !isDismissed && !!config.apiUrl;

  // Show local-only mode banner (only when a server was expected)
  if (shouldShowLocalOnlyBanner) {
    const isMonitoringApiOnline = status.api === 'connected';
    const isOllamaOnline = status.ollama === 'connected';

    return (
      <div className="bg-amber-900/80 border-b-2 border-amber-500/50 backdrop-blur-sm relative z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Offline/Local Icon */}
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              {/* Message */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0">
                <span className="text-sm font-semibold text-amber-100">
                  {!isMonitoringApiOnline
                    ? 'No Monitoring Server (API) Online'
                    : !isOllamaOnline
                    ? 'Monitoring Server Online, Ollama Offline'
                    : 'Running Locally'}
                </span>
                <span className="text-xs text-amber-200/90 hidden sm:inline">
                  {!isMonitoringApiOnline ? (
                    <>
                      SafeOS is running fully local/offline AI on this device. Remote channels and integrations work when a monitoring server is available.
                    </>
                  ) : !isOllamaOnline ? (
                    <>
                      Using browser-based vision AI locally. Connect Ollama to enable advanced server-side analysis.
                    </>
                  ) : (
                    <>SafeOS is running fully local/offline AI on this device.</>
                  )}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleConfigure}
                className="px-3 py-1.5 text-xs font-medium text-amber-900 hover:text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap"
              >
                Settings
              </button>
              {!!config.apiUrl && (
                <button
                  onClick={retry}
                  className="px-3 py-1.5 text-xs font-medium text-amber-200 hover:text-white bg-amber-700/50 hover:bg-amber-600/50 rounded-lg transition-colors"
                >
                  Retry
                </button>
              )}
              {dismissible && (
                <button
                  onClick={handleDismiss}
                  className="p-1.5 text-amber-300 hover:text-amber-100 transition-colors"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show connecting state
  if (status.api === 'connecting') {
    return (
      <div className="bg-blue-500/10 border-b border-blue-500/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Spinner */}
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>

            {/* Message */}
            <span className="text-sm text-blue-300">Connecting to monitoring server...</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// =============================================================================
// Compact Status Indicator (for header/nav)
// =============================================================================

export function StatusIndicator() {
  const { status, isLocalOnly, isConnected, config } = useBackendStatus();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  if (!isVisible) return null;

  // Connection status dot
  const getStatusColor = () => {
    if (isConnected) return 'bg-emerald-400';
    if (status.api === 'connecting') return 'bg-blue-400 animate-pulse';
    if (isLocalOnly) return 'bg-amber-400';
    if (status.error) return 'bg-red-400';
    return 'bg-slate-400';
  };

  const getStatusText = () => {
    if (isConnected) return 'Connected';
    if (status.api === 'connecting') return 'Connecting...';
    if (isLocalOnly) {
      if (config.apiUrl) return 'No Monitoring Server Online';
      return 'Local Mode';
    }
    if (status.error) return 'Error';
    return 'Disconnected';
  };

  return (
    <div className="flex items-center gap-2" title={getStatusText()}>
      <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span className="text-xs text-slate-400 hidden sm:inline">{getStatusText()}</span>
    </div>
  );
}

// =============================================================================
// Feature Disabled Badge
// =============================================================================

interface FeatureDisabledBadgeProps {
  feature: string;
  className?: string;
}

export function FeatureDisabledBadge({ feature, className = '' }: FeatureDisabledBadgeProps) {
  const { isFeatureAvailable } = useBackendStatus();

  if (isFeatureAvailable(feature)) {
    return null;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-amber-400 bg-amber-500/10 rounded-full ${className}`}>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m-6.93 3a9 9 0 1113.86 0H3.07z" />
      </svg>
      Requires Monitoring Server
    </span>
  );
}

export default StatusBanner;
