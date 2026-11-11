/**
 * Online Status Component
 *
 * Shows online/offline status and sync queue count.
 *
 * @module components/OnlineStatus
 */

'use client';

import React, { useEffect, useState } from 'react';
import { isOnlineStatus, forceSyncNow, startPeriodicSync } from '../lib/sync-service';
import { getStorageStats } from '../lib/client-db';

// =============================================================================
// Component
// =============================================================================

export function OnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [syncPending, setSyncPending] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Initial state
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    // Start periodic sync
    startPeriodicSync();

    // Update stats
    const updateStats = async () => {
      try {
        const stats = await getStorageStats();
        setSyncPending(stats.syncPending);
      } catch (error) {
        console.error('Failed to get storage stats:', error);
      }
    };

    updateStats();
    const interval = setInterval(updateStats, 10000);

    // Online/offline listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await forceSyncNow();
      setSyncPending(result.pending);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isOnline && syncPending === 0) {
    return null; // Don't show when everything is synced
  }

  return (
    <div
      className={`
        fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg
        ${isOnline ? 'bg-amber-500/90' : 'bg-slate-700/90'}
        backdrop-blur-sm
      `}
    >
      {/* Status Icon */}
      {isOnline ? (
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
        </svg>
      )}

      {/* Text */}
      <div className="text-white">
        {isOnline ? (
          <span className="text-sm font-medium">
            {syncPending} pending changes
          </span>
        ) : (
          <div>
            <span className="text-sm font-medium">You&apos;re offline</span>
            {syncPending > 0 && (
              <span className="text-xs opacity-75 ml-2">
                ({syncPending} pending)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Sync Button */}
      {isOnline && syncPending > 0 && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="px-3 py-1.5 text-sm font-medium bg-white/20 hover:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
        >
          {isSyncing ? (
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            'Sync Now'
          )}
        </button>
      )}
    </div>
  );
}

export default OnlineStatus;





























