/**
 * Data Export Page
 *
 * Export alerts, analysis, and user data.
 *
 * @module app/export/page
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '../../stores/auth-store';
import { getApiUrl, isStaticMode } from '@/lib/env';

// =============================================================================
// Types
// =============================================================================

type ExportType = 'alerts' | 'analysis' | 'streams' | 'profile' | 'all';
type ExportFormat = 'json' | 'csv';

interface ExportOption {
  id: ExportType;
  label: string;
  description: string;
  icon: React.ReactNode;
  formats: ExportFormat[];
}

// =============================================================================
// Data
// =============================================================================

// Export type icons as accessible SVGs
const exportIcons: Record<ExportType, React.ReactNode> = {
  alerts: (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  analysis: (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  streams: (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  profile: (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  all: (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
};

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'alerts',
    label: 'Alerts',
    description: 'All alerts with timestamps, severity, and messages',
    icon: exportIcons.alerts,
    formats: ['json', 'csv'],
  },
  {
    id: 'analysis',
    label: 'AI Analysis Results',
    description: 'Analysis results, concern levels, and processing times',
    icon: exportIcons.analysis,
    formats: ['json', 'csv'],
  },
  {
    id: 'streams',
    label: 'Stream History',
    description: 'All monitoring sessions with stats',
    icon: exportIcons.streams,
    formats: ['json', 'csv'],
  },
  {
    id: 'profile',
    label: 'Profile & Settings',
    description: 'Your profile, preferences, notification settings, monitoring profiles and active choices',
    icon: exportIcons.profile,
    formats: ['json'],
  },
  {
    id: 'all',
    label: 'Full Data Export',
    description: 'Your account profile, sessions, streams, alerts, analysis and monitoring settings',
    icon: exportIcons.all,
    formats: ['json'],
  },
];

// =============================================================================
// Component
// =============================================================================

export default function ExportPage() {
  const { sessionToken, isAuthenticated, isInitialized } = useAuthStore();

  const [selectedType, setSelectedType] = useState<ExportType>('alerts');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const API_URL = getApiUrl();

  const handleExport = async () => {
    setIsExporting(true);
    setStatusMessage({ type: 'info', text: 'Preparing export...' });

    try {
      const params = new URLSearchParams();
      params.append('format', selectedFormat);
      if (dateRange.start) params.append('startDate', dateRange.start);
      if (dateRange.end) params.append('endDate', dateRange.end);

      const res = await fetch(`${API_URL}/api/export/${selectedType}?${params.toString()}`, {
        headers: { 'X-Session-Token': sessionToken || '' },
      });

      if (!res.ok) {
        throw new Error('Export failed');
      }

      let omittedSettings = 0;
      if (selectedType === 'profile' || selectedType === 'all') {
        const result = await res.clone().json();
        const data = selectedType === 'profile' ? result.data : result;
        omittedSettings = data?.monitoringSettingsOmitted ?? 0;
      }

      // Get filename from header or generate one
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `safeos-${selectedType}-${new Date().toISOString().split('T')[0]}.${selectedFormat}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download file
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatusMessage(omittedSettings > 0 ? {
        type: 'info',
        text: `Downloaded ${filename}. ${omittedSettings} monitoring ${omittedSettings === 1 ? 'profile had' : 'profiles had'} unreadable settings left out. Check monitoringSettingsOmitted in the file for the count.`,
      } : { type: 'success', text: `Downloaded ${filename}` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Export failed. Please try again later.' });
    } finally {
      setIsExporting(false);
    }
  };

  const selectedOption = EXPORT_OPTIONS.find((o) => o.id === selectedType);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (isStaticMode() || !API_URL) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="max-w-lg text-center">
          <h1 className="text-2xl font-bold mb-3">No Monitoring Server (API) Online</h1>
          <p className="text-slate-300 mb-6">
            SafeOS Guardian is running fully local/offline on this device. This page exports data from an optional monitoring server, which isn&apos;t available right now.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/history"
              className="inline-flex items-center justify-center px-5 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
            >
              Use Offline Export (History)
            </Link>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('safeos:open-backend-settings'))}
              className="inline-flex items-center justify-center px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            >
              Monitoring server settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in</h1>
          <Link href="/" className="text-emerald-400 hover:underline">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-slate-700/50">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/settings" className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Export Data</h1>
            <p className="text-xs text-slate-400">Download your monitoring data</p>
          </div>
        </div>
      </header>

      {/* Status Message */}
      {statusMessage && (
        <div className={`max-w-3xl mx-auto mt-4 mx-4 sm:mx-auto p-4 rounded-xl border ${statusMessage.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' :
            statusMessage.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-300' :
              'bg-blue-500/20 border-blue-500/50 text-blue-300'
          }`}>
          {statusMessage.text}
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Export Type Selection */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">What to Export</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {EXPORT_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  setSelectedType(option.id);
                  if (!option.formats.includes(selectedFormat)) {
                    setSelectedFormat(option.formats[0]);
                  }
                }}
                className={`p-4 rounded-lg border text-left transition-colors ${selectedType === option.id
                  ? 'bg-emerald-500/20 border-emerald-500/50'
                  : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
                  }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-slate-300">{option.icon}</span>
                  <span className="font-medium text-white">{option.label}</span>
                </div>
                <p className="text-sm text-slate-400">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Format & Options */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Export Options</h2>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Format */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Format</label>
              <div className="flex gap-2">
                {selectedOption?.formats.map((format) => (
                  <button
                    key={format}
                    onClick={() => setSelectedFormat(format)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedFormat === format
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range (for applicable types) */}
            {['alerts', 'analysis'].includes(selectedType) && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">End Date</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Export Button */}
        <div className="flex justify-end">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Export
              </>
            )}
          </button>
        </div>

        {/* Privacy Notice */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-blue-400">ℹ️</span>
            <div>
              <h3 className="font-medium text-blue-300 mb-1">Your Data, Your Control</h3>
              <p className="text-sm text-slate-400">
                Server exports contain your account data. Full Data Export includes your profile,
                sessions, owned monitoring settings and active choices, plus up to 1,000 streams
                and 5,000 each of alerts and analysis results. Export browser-only history from History.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
