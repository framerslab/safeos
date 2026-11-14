/**
 * Notification Dropdown Component
 *
 * Shows recent alerts in a dropdown menu from the nav bell icon.
 * Connects to monitoring store for real-time alert data.
 *
 * @module components/NotificationDropdown
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  useMonitoringStore,
  selectUnacknowledgedAlerts,
  selectAlerts,
  type Alert,
} from '../stores/monitoring-store';
import {
  IconBell,
  IconX,
  IconCheck,
  IconAlertTriangle,
  IconInfo,
  IconChevronRight,
} from './icons';

// =============================================================================
// Utility Functions
// =============================================================================

function getSeverityColor(severity: Alert['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500';
    case 'high':
      return 'bg-orange-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'low':
      return 'bg-blue-500';
    case 'info':
    default:
      return 'bg-slate-500';
  }
}

function getSeverityIcon(severity: Alert['severity']): React.ReactNode {
  switch (severity) {
    case 'critical':
    case 'high':
      return <IconAlertTriangle size={14} className="text-red-400" />;
    case 'medium':
      return <IconAlertTriangle size={14} className="text-yellow-400" />;
    default:
      return <IconInfo size={14} className="text-blue-400" />;
  }
}

function formatTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

// =============================================================================
// Component
// =============================================================================

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unacknowledgedAlerts = useMonitoringStore(selectUnacknowledgedAlerts);
  const allAlerts = useMonitoringStore(selectAlerts);
  const acknowledgeAlert = useMonitoringStore((state) => state.acknowledgeAlert);
  const clearAlerts = useMonitoringStore((state) => state.clearAlerts);

  const alertCount = unacknowledgedAlerts.length;
  const displayAlerts = allAlerts.slice(0, 10); // Show up to 10 recent alerts

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleAcknowledge = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      acknowledgeAlert(id);
    },
    [acknowledgeAlert]
  );

  const handleClearAll = useCallback(() => {
    clearAlerts();
    setIsOpen(false);
  }, [clearAlerts]);

  if (!mounted) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center w-11 h-11 rounded-lg
                   text-zinc-400 hover:text-zinc-100 hover:bg-white/5
                   border border-transparent hover:border-white/10 transition-all"
        aria-label={`Notifications${alertCount > 0 ? ` (${alertCount} unread)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <IconBell size={20} />
        {alertCount > 0 && (
          <span
            className="absolute top-0.5 right-0.5 min-w-5 h-5 px-1 rounded-full
                       bg-red-500 text-white text-[13px] leading-none font-semibold
                       flex items-center justify-center animate-pulse"
          >
            {alertCount > 99 ? '99+' : alertCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute top-full right-0 mt-2 w-80 max-h-[70vh] overflow-hidden
                     bg-[rgba(15,20,25,0.98)] backdrop-blur-xl border border-slate-700/50
                     rounded-xl shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-top-2"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <IconBell size={16} className="text-emerald-500" />
              <span className="font-semibold text-white text-sm">Notifications</span>
              {alertCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400 rounded-full">
                  {alertCount} new
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
              aria-label="Close notifications"
            >
              <IconX size={16} />
            </button>
          </div>

          {/* Alert List */}
          <div className="overflow-y-auto max-h-[calc(70vh-110px)]">
            {displayAlerts.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <IconBell size={32} className="mx-auto text-slate-600 mb-2" />
                <p className="text-sm text-slate-400">No notifications yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Alerts will appear here when detected
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/30">
                {displayAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`px-4 py-3 hover:bg-slate-800/50 transition-colors ${
                      !alert.acknowledged ? 'bg-slate-800/30' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Severity indicator */}
                      <div className="flex-shrink-0 mt-0.5">
                        <div
                          className={`w-2 h-2 rounded-full ${getSeverityColor(
                            alert.severity
                          )}`}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {getSeverityIcon(alert.severity)}
                          <span className="text-xs font-medium text-slate-300 uppercase">
                            {alert.severity}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatTimeAgo(alert.createdAt || alert.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-white truncate">{alert.message}</p>
                        {alert.alertType && (
                          <span className="text-xs text-slate-500">{alert.alertType}</span>
                        )}
                      </div>

                      {/* Acknowledge button */}
                      {!alert.acknowledged && (
                        <button
                          onClick={(e) => handleAcknowledge(alert.id, e)}
                          className="flex-shrink-0 p-1.5 rounded-md bg-emerald-500/20 text-emerald-400
                                     hover:bg-emerald-500/30 transition-colors"
                          aria-label="Acknowledge alert"
                          title="Mark as read"
                        >
                          <IconCheck size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-700/50 px-4 py-2.5 flex items-center justify-between">
            {displayAlerts.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-slate-400 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
            <Link
              href="/history"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors ml-auto"
            >
              View all history
              <IconChevronRight size={12} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationDropdown;
