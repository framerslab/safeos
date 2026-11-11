/**
 * Notification Permission Component
 *
 * Handles browser notification permission requests with a friendly,
 * non-intrusive UI explaining why notifications are useful.
 *
 * @module components/NotificationPermission
 */

'use client';

import { showBrowserNotification } from '@/lib/browser-notification';
import React, { useState, useEffect, useCallback } from 'react';
import { IconBell, IconX, IconCheck } from './icons';

// =============================================================================
// Constants
// =============================================================================

const DISMISSED_KEY = 'safeos-notification-prompt-dismissed';
const DISMISSED_DURATION = 14 * 24 * 60 * 60 * 1000; // 14 days

// =============================================================================
// Utility Functions
// =============================================================================

function isNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator;
}

function getPermissionStatus(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

function isDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  const dismissed = localStorage.getItem(DISMISSED_KEY);
  if (!dismissed) return false;
  
  const dismissedTime = parseInt(dismissed, 10);
  if (Date.now() - dismissedTime > DISMISSED_DURATION) {
    localStorage.removeItem(DISMISSED_KEY);
    return false;
  }
  return true;
}

function setDismissed(): void {
  localStorage.setItem(DISMISSED_KEY, Date.now().toString());
}

// =============================================================================
// Component
// =============================================================================

export function NotificationPermission() {
  const [mounted, setMounted] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setMounted(true);

    const status = getPermissionStatus();
    setPermission(status);

    // Only show prompt if:
    // 1. Notifications are supported
    // 2. Permission hasn't been granted or denied
    // 3. User hasn't dismissed the prompt recently
    if (status === 'default' && !isDismissed()) {
      // Delay showing to avoid overwhelming user on first visit
      const timeout = setTimeout(() => {
        setShowPrompt(true);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, []);

  const handleRequestPermission = useCallback(async () => {
    if (!isNotificationSupported()) return;

    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        // Show a test notification
        void showBrowserNotification('SafeOS Guardian', {
          body: 'Notifications enabled! You\'ll receive alerts here.',
          icon: '/icons/icon-192.png',
          tag: 'permission-granted',
        });
        setShowPrompt(false);
      } else if (result === 'denied') {
        setShowPrompt(false);
      }
    } catch (error) {
      console.error('[Notifications] Permission request error:', error);
    }
    setRequesting(false);
  }, []);

  const handleDismiss = useCallback(() => {
    setShowPrompt(false);
    setDismissed();
  }, []);

  // Don't render on server or if not showing
  if (!mounted || !showPrompt) return null;

  return (
    <div className="fixed top-20 left-4 right-4 z-[99] md:left-auto md:right-4 md:max-w-sm animate-fade-in">
      <div className="bg-[rgba(15,20,25,0.98)] backdrop-blur-xl border border-blue-500/40 rounded-xl p-4 shadow-2xl shadow-black/50">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Dismiss"
        >
          <IconX size={16} />
        </button>

        <div className="pr-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/25 flex items-center justify-center">
              <IconBell size={20} className="text-blue-300" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Enable notifications</h3>
              <p className="text-xs text-slate-300">Get instant alerts</p>
            </div>
          </div>

          <p className="text-xs text-slate-300 mb-3 leading-relaxed">
            Receive immediate alerts when motion, sound, or other events are detected — even when the browser is minimized.
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleRequestPermission}
              disabled={requesting}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {requesting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <IconCheck size={16} />
                  Enable
                </>
              )}
            </button>
            <button
              onClick={handleDismiss}
              className="py-2.5 px-4 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Later
            </button>
          </div>

          {permission === 'denied' && (
            <p className="mt-2 text-xs text-amber-400">
              Notifications were blocked. Enable them in your browser settings.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationPermission;




























