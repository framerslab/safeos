/**
 * Alert History Page
 *
 * View past alerts and analysis results.
 *
 * @module app/history/page
 */

'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { isStaticMode } from '@/lib/env';
import { useMonitoringStore } from '@/stores/monitoring-store';
import { useSettingsStore } from '@/stores/settings-store';
import {
  acknowledgeIntrusionFrame,
  acknowledgeMatchFrame,
  getAllIntrusionFrames,
  getAllMatchFrames,
  getAllSubjectProfiles,
  markIntrusionFramesExported,
  markMatchFramesExported,
  updateIntrusionFrameNotes,
  updateMatchFrameNotes,
  type IntrusionFrameDB,
  type MatchFrameDB,
  type SubjectProfileDB,
} from '@/lib/client-db';

// =============================================================================
// Types
// =============================================================================

interface Alert {
  id: string;
  stream_id: string;
  alert_type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  message: string;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

interface AnalysisResult {
  id: string;
  stream_id: string;
  concern_level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  model_used: string;
  processing_time_ms: number;
  created_at: string;
}

type ViewMode = 'local' | 'alerts' | 'analysis';
type FilterSeverity = 'all' | 'info' | 'low' | 'medium' | 'high' | 'critical';

type LocalFilterType = 'all' | 'alerts' | 'lost_found' | 'intrusions';
type LocalTimelineSeverity = FilterSeverity;

interface LocalTimelineEvent {
  id: string;
  type: 'alert' | 'lost_found' | 'intrusion';
  timestamp: number;
  acknowledged: boolean;
  severity: LocalTimelineSeverity;
  title: string;
  description: string;
  thumbnailData?: string;
  meta?: Record<string, any>;
}

// =============================================================================
// Helpers
// =============================================================================

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  info: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  low: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
  none: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30' },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than 1 minute
  if (diff < 60 * 1000) return 'Just now';

  // Less than 1 hour
  if (diff < 60 * 60 * 1000) {
    const mins = Math.floor(diff / (60 * 1000));
    return `${mins} min${mins > 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  // Otherwise show full date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =============================================================================
// Component
// =============================================================================

export default function HistoryPage() {
  useEffect(() => {
    void useMonitoringStore.getState().hydrateAlerts();
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('alerts');
  const [filter, setFilter] = useState<FilterSeverity>('all');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localAlerts = useMonitoringStore((s) => s.alerts);
  const acknowledgeLocalAlert = useMonitoringStore((s) => s.acknowledgeAlert);
  const exportSettingsJson = useSettingsStore((s) => s.exportSettings);

  const [isStaticDeployment, setIsStaticDeployment] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localFilter, setLocalFilter] = useState<LocalFilterType>('all');
  const [localUnackOnly, setLocalUnackOnly] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const [expandedEventKey, setExpandedEventKey] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [matchFrames, setMatchFrames] = useState<MatchFrameDB[]>([]);
  const [intrusionFrames, setIntrusionFrames] = useState<IntrusionFrameDB[]>([]);
  const [subjects, setSubjects] = useState<SubjectProfileDB[]>([]);

  const [exportIncludeFullFrames, setExportIncludeFullFrames] = useState(false);
  const [exportOnlyUnexportedFrames, setExportOnlyUnexportedFrames] = useState(true);
  const [exportCompressGzip, setExportCompressGzip] = useState(false);
  const [exportMarkExported, setExportMarkExported] = useState(true);
  const [isExportingLocal, setIsExportingLocal] = useState(false);

  const loadLocalData = useCallback(async () => {
    setLocalLoading(true);
    setLocalError(null);

    try {
      const [matches, intrusions, profiles] = await Promise.all([
        getAllMatchFrames(250),
        getAllIntrusionFrames(250),
        getAllSubjectProfiles(),
      ]);
      setMatchFrames(matches);
      setIntrusionFrames(intrusions);
      setSubjects(profiles);
    } catch (err) {
      setLocalError('Failed to load local timeline data');
    } finally {
      setLocalLoading(false);
    }
  }, []);

  useEffect(() => {
    // Detect static deployments (GitHub Pages, Pages.dev, etc) and default to local timeline.
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isStatic = isStaticMode() ||
      hostname === 'safeos.sh' ||
      hostname.endsWith('.github.io') ||
      hostname.endsWith('.pages.dev');

    setIsStaticDeployment(isStatic);
    if (isStatic) {
      setViewMode('local');
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'local') {
      loadLocalData();
      return;
    }

    fetchData();
  }, [viewMode, loadLocalData]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    // Skip API calls in static mode (GitHub Pages deployment)
    // Check both the utility function and directly check hostname
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isStatic = isStaticMode() ||
      hostname === 'safeos.sh' ||
      hostname.endsWith('.github.io') ||
      hostname.endsWith('.pages.dev');

    if (isStatic) {
      console.log('[History] Static mode detected, skipping API calls');
      setAlerts([]);
      setAnalysisResults([]);
      setIsLoading(false);
      return;
    }

    try {
      if (viewMode === 'alerts') {
        const response = await fetch('/api/alerts?limit=100');
        const data = await response.json();
        if (data.success) {
          setAlerts(data.data);
        }
      } else {
        const response = await fetch('/api/analysis?limit=100');
        const data = await response.json();
        if (data.success) {
          setAnalysisResults(data.data);
        }
      }
    } catch (err) {
      setError('Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAlerts = filter === 'all'
    ? alerts
    : alerts.filter((a) => a.severity === filter);

  const filteredAnalysis = filter === 'all'
    ? analysisResults
    : analysisResults.filter((a) => a.concern_level === filter);

  const subjectNameById = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);

  const localTimelineEvents = useMemo<LocalTimelineEvent[]>(() => {
    const events: LocalTimelineEvent[] = [];

    for (const alert of localAlerts) {
      const time = alert.createdAt || alert.timestamp;
      const ts = time ? new Date(time).getTime() : Date.now();

      events.push({
        id: alert.id,
        type: 'alert',
        timestamp: ts,
        acknowledged: alert.acknowledged,
        severity: (alert.severity as LocalTimelineSeverity) || 'info',
        title: 'Monitoring Alert',
        description: alert.message,
        thumbnailData: alert.thumbnailUrl?.startsWith('data:') ? alert.thumbnailUrl : undefined,
        meta: {
          streamId: alert.streamId,
          alertType: alert.alertType,
        },
      });
    }

    for (const frame of matchFrames) {
      const confidence = frame.confidence ?? 0;
      const severity: LocalTimelineSeverity = confidence >= 90 ? 'high' : confidence >= 75 ? 'medium' : 'low';
      const subjectName = subjectNameById.get(frame.subjectId);

      events.push({
        id: frame.id,
        type: 'lost_found',
        timestamp: frame.timestamp,
        acknowledged: frame.acknowledged,
        severity,
        title: `Lost & Found Match${subjectName ? `: ${subjectName}` : ''}`,
        description: `${confidence}% confidence`,
        thumbnailData: frame.thumbnailData,
        meta: {
          subjectId: frame.subjectId,
          confidence,
          exported: frame.exported,
          notes: frame.notes,
        },
      });
    }

    for (const frame of intrusionFrames) {
      const excess = Math.max(0, (frame.personCount ?? 0) - (frame.allowedCount ?? 0));
      const severity: LocalTimelineSeverity = excess >= 2 ? 'critical' : excess >= 1 ? 'high' : 'medium';

      events.push({
        id: frame.id,
        type: 'intrusion',
        timestamp: frame.timestamp,
        acknowledged: frame.acknowledged,
        severity,
        title: 'Security Intrusion',
        description: `${frame.personCount} detected • ${excess} unauthorized`,
        thumbnailData: frame.thumbnailData,
        meta: {
          personCount: frame.personCount,
          allowedCount: frame.allowedCount,
          exported: frame.exported,
          notes: frame.notes,
        },
      });
    }

    events.sort((a, b) => b.timestamp - a.timestamp);

    const filteredByType = localFilter === 'all'
      ? events
      : events.filter((e) => (localFilter === 'alerts'
        ? e.type === 'alert'
        : localFilter === 'lost_found'
          ? e.type === 'lost_found'
          : e.type === 'intrusion'));

    const filteredByAck = localUnackOnly
      ? filteredByType.filter((e) => !e.acknowledged)
      : filteredByType;

    const query = localQuery.trim().toLowerCase();
    if (!query) return filteredByAck;

    return filteredByAck.filter((e) => {
      const haystack = [
        e.title,
        e.description,
        e.type,
        String(e.meta?.notes ?? ''),
        String(e.meta?.subjectId ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [intrusionFrames, localAlerts, localFilter, localQuery, localUnackOnly, matchFrames, subjectNameById]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const exportLocalBundle = async () => {
    setIsExportingLocal(true);
    setLocalError(null);

    try {
      const settings = JSON.parse(exportSettingsJson());
      const date = new Date().toISOString().slice(0, 10);

      const selectedMatchFrames = exportOnlyUnexportedFrames
        ? matchFrames.filter((f) => !f.exported)
        : matchFrames;

      const selectedIntrusionFrames = exportOnlyUnexportedFrames
        ? intrusionFrames.filter((f) => !f.exported)
        : intrusionFrames;

      const matchExport = exportIncludeFullFrames
        ? selectedMatchFrames
        : selectedMatchFrames.map(({ frameData, ...rest }) => rest);

      const intrusionExport = exportIncludeFullFrames
        ? selectedIntrusionFrames
        : selectedIntrusionFrames.map(({ frameData, ...rest }) => rest);

      const payload = {
        version: 1,
        generatedAt: new Date().toISOString(),
        settings,
        alerts: localAlerts,
        lostFound: {
          subjects,
          matchFrames: matchExport,
        },
        security: {
          intrusionFrames: intrusionExport,
        },
      };

      const json = JSON.stringify(payload, null, 2);

      const gzipSupported = typeof window !== 'undefined' && 'CompressionStream' in window;
      if (exportCompressGzip && gzipSupported) {
        const stream = new (window as any).CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        writer.write(new TextEncoder().encode(json));
        await writer.close();
        const gzBlob = await new Response(stream.readable).blob();
        downloadBlob(gzBlob, `safeos-local-bundle-${date}.json.gz`);
      } else {
        downloadBlob(new Blob([json], { type: 'application/json' }), `safeos-local-bundle-${date}.json`);
      }

      if (exportMarkExported) {
        const matchIds = selectedMatchFrames.map((f) => f.id);
        const intrusionIds = selectedIntrusionFrames.map((f) => f.id);

        await Promise.all([
          matchIds.length > 0 ? markMatchFramesExported(matchIds) : Promise.resolve(),
          intrusionIds.length > 0 ? markIntrusionFramesExported(intrusionIds) : Promise.resolve(),
        ]);

        if (matchIds.length > 0) {
          const matchIdSet = new Set(matchIds);
          setMatchFrames((prev) => prev.map((f) => (matchIdSet.has(f.id) ? { ...f, exported: true } : f)));
        }

        if (intrusionIds.length > 0) {
          const intrusionIdSet = new Set(intrusionIds);
          setIntrusionFrames((prev) => prev.map((f) => (intrusionIdSet.has(f.id) ? { ...f, exported: true } : f)));
        }
      }
    } catch (err) {
      setLocalError('Export failed. Please try again.');
    } finally {
      setIsExportingLocal(false);
    }
  };

  const loading = viewMode === 'local' ? localLoading : isLoading;
  const activeError = viewMode === 'local' ? localError : error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-slate-700/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors" aria-label="Go back to dashboard">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-white">History</h1>
          </div>

          <button
            onClick={() => (viewMode === 'local' ? loadLocalData() : fetchData())}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Tabs & Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          {/* View Mode Tabs */}
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('local')}
              className={`px-4 py-2 rounded-md transition-colors ${viewMode === 'local'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              Local Timeline
            </button>
            <button
              onClick={() => setViewMode('alerts')}
              className={`px-4 py-2 rounded-md transition-colors ${viewMode === 'alerts'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
              disabled={isStaticDeployment}
            >
              Alerts
            </button>
            <button
              onClick={() => setViewMode('analysis')}
              className={`px-4 py-2 rounded-md transition-colors ${viewMode === 'analysis'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
                }`}
              disabled={isStaticDeployment}
            >
              Analysis Results
            </button>
          </div>

          {/* Filters */}
          {viewMode === 'local' ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Type:</span>
                <select
                  value={localFilter}
                  onChange={(e) => setLocalFilter(e.target.value as LocalFilterType)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="all">All</option>
                  <option value="alerts">Alerts</option>
                  <option value="lost_found">Lost &amp; Found</option>
                  <option value="intrusions">Intrusions</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={localUnackOnly}
                  onChange={(e) => setLocalUnackOnly(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                Unacknowledged only
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">Filter:</span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterSeverity)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : activeError ? (
          <div className="text-center py-20">
            <p className="text-red-400">{activeError}</p>
            <button
              onClick={() => (viewMode === 'local' ? loadLocalData() : fetchData())}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : viewMode === 'local' ? (
          <div className="space-y-6">
            {/* Export */}
            <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Offline Export</h2>
                  <p className="text-sm text-slate-400">
                    Download a local-first bundle (settings + alerts + saved frames) for backups or sharing.
                  </p>
                </div>
                <button
                  onClick={exportLocalBundle}
                  disabled={isExportingLocal}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isExportingLocal
                    ? 'Exporting…'
                    : exportCompressGzip
                      ? 'Download Bundle (.json.gz)'
                      : 'Download Bundle (.json)'}
                </button>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-4">
                <label
                  className="flex items-center gap-2 text-sm text-slate-300 select-none"
                  title="Only include frames that are not yet marked as exported (useful for incremental backups)."
                >
                  <input
                    type="checkbox"
                    checked={exportOnlyUnexportedFrames}
                    onChange={(e) => setExportOnlyUnexportedFrames(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  Only unexported frames (incremental)
                </label>
                <label
                  className="flex items-center gap-2 text-sm text-slate-300 select-none"
                  title="Include full stored images (larger download). Disable for lightweight metadata-only exports."
                >
                  <input
                    type="checkbox"
                    checked={exportIncludeFullFrames}
                    onChange={(e) => setExportIncludeFullFrames(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  Include full frames (larger file)
                </label>
                <label
                  className="flex items-center gap-2 text-sm text-slate-300 select-none"
                  title="Compress the export using gzip for smaller downloads (requires a modern browser)."
                >
                  <input
                    type="checkbox"
                    checked={exportCompressGzip}
                    onChange={(e) => setExportCompressGzip(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                    disabled={typeof window !== 'undefined' && !('CompressionStream' in window)}
                  />
                  Compress (gzip)
                </label>
                <label
                  className="flex items-center gap-2 text-sm text-slate-300 select-none"
                  title="After a successful download, mark included frames as exported so future incremental exports don’t repeat them."
                >
                  <input
                    type="checkbox"
                    checked={exportMarkExported}
                    onChange={(e) => setExportMarkExported(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  Mark frames as exported
                </label>
              </div>

              {typeof window !== 'undefined' && !('CompressionStream' in window) && (
                <div className="mt-2 text-xs text-slate-500">
                  Tip: gzip export requires a modern browser (CompressionStream API).
                </div>
              )}

              <div className="mt-3 text-xs text-slate-500">
                {isStaticDeployment
                  ? 'Static deployment detected: remote history is disabled. Local timeline is fully offline.'
                  : 'Local timeline works offline; remote history requires the API.'}
              </div>
            </section>

            {/* Timeline */}
            <section className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={localQuery}
                  onChange={(e) => setLocalQuery(e.target.value)}
                  placeholder="Search events, notes, subjects…"
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="Search local timeline"
                />
                {localQuery.trim().length > 0 && (
                  <button
                    onClick={() => setLocalQuery('')}
                    className="px-4 py-2 bg-slate-700/50 text-slate-200 rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {localTimelineEvents.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-slate-400">No local events yet</p>
                  <p className="text-sm text-slate-500 mt-1">Start monitoring or enable Lost &amp; Found/Security to record events offline</p>
                </div>
              ) : (
                localTimelineEvents.map((event) => {
                  const colors = severityColors[event.severity];
                  const eventKey = `${event.type}:${event.id}`;
                  const isExpanded = expandedEventKey === eventKey;
                  const exported = Boolean(event.meta?.exported);

                  const acknowledgeEvent = async () => {
                    try {
                      if (event.type === 'alert') {
                        acknowledgeLocalAlert(event.id);
                        return;
                      }

                      if (event.type === 'lost_found') {
                        await acknowledgeMatchFrame(event.id);
                        setMatchFrames((prev) => prev.map((f) => f.id === event.id ? { ...f, acknowledged: true } : f));
                        return;
                      }

                      await acknowledgeIntrusionFrame(event.id);
                      setIntrusionFrames((prev) => prev.map((f) => f.id === event.id ? { ...f, acknowledged: true } : f));
                    } catch {
                      setLocalError('Failed to acknowledge item');
                    }
                  };

                  const toggleDetails = () => {
                    if (isExpanded) {
                      setExpandedEventKey(null);
                      return;
                    }
                    setExpandedEventKey(eventKey);
                    setNotesDraft(String(event.meta?.notes ?? ''));
                  };

                  const saveNotes = async () => {
                    if (!(event.type === 'lost_found' || event.type === 'intrusion')) return;
                    setIsSavingNotes(true);
                    setLocalError(null);

                    try {
                      if (event.type === 'lost_found') {
                        await updateMatchFrameNotes(event.id, notesDraft);
                        setMatchFrames((prev) => prev.map((f) => f.id === event.id ? { ...f, notes: notesDraft } : f));
                      } else {
                        await updateIntrusionFrameNotes(event.id, notesDraft);
                        setIntrusionFrames((prev) => prev.map((f) => f.id === event.id ? { ...f, notes: notesDraft } : f));
                      }
                    } catch {
                      setLocalError('Failed to save notes');
                    } finally {
                      setIsSavingNotes(false);
                    }
                  };

                  const markThisExported = async () => {
                    if (!(event.type === 'lost_found' || event.type === 'intrusion')) return;
                    setLocalError(null);

                    try {
                      if (event.type === 'lost_found') {
                        await markMatchFramesExported([event.id]);
                        setMatchFrames((prev) => prev.map((f) => f.id === event.id ? { ...f, exported: true } : f));
                      } else {
                        await markIntrusionFramesExported([event.id]);
                        setIntrusionFrames((prev) => prev.map((f) => f.id === event.id ? { ...f, exported: true } : f));
                      }
                    } catch {
                      setLocalError('Failed to mark exported');
                    }
                  };

                  return (
                    <div
                      key={`${event.type}-${event.id}`}
                      className={`p-4 rounded-xl border ${colors.border} ${colors.bg}`}
                    >
                      <div className="flex items-start gap-4">
                        {event.thumbnailData && (
                          <div className="w-20 h-20 rounded-lg bg-slate-900/50 border border-slate-700 overflow-hidden flex-shrink-0">
                            <img
                              src={event.thumbnailData}
                              alt={`${event.title} thumbnail`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors.text} ${colors.bg}`}>
                                {event.severity.toUpperCase()}
                              </span>
                              <span className="text-sm font-medium text-white truncate">
                                {event.title}
                              </span>
                            </div>
                            <span className="text-xs text-slate-500 whitespace-nowrap">
                              {formatDate(new Date(event.timestamp).toISOString())}
                            </span>
                          </div>

                          <p className="text-sm text-slate-200 mt-1">
                            {event.description}
                          </p>

                          <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                              {event.acknowledged ? (
                                <span className="text-emerald-400">✓ Acknowledged</span>
                              ) : (
                                <span>Unacknowledged</span>
                              )}
                              {(event.type === 'lost_found' || event.type === 'intrusion') && (
                                <span className={`px-2 py-0.5 rounded ${exported ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700/30 text-slate-300'}`}>
                                  {exported ? 'Exported' : 'Not exported'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={toggleDetails}
                                className="px-3 py-1.5 text-xs font-medium bg-slate-700/40 text-slate-200 rounded hover:bg-slate-700 transition-colors"
                              >
                                {isExpanded ? 'Hide' : 'Details'}
                              </button>
                              {!event.acknowledged && (
                                <button
                                  onClick={acknowledgeEvent}
                                  className="px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors"
                                >
                                  Acknowledge
                                </button>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400">
                                <div>
                                  <span className="text-slate-500">Type:</span> {event.type}
                                </div>
                                <div>
                                  <span className="text-slate-500">ID:</span> {event.id}
                                </div>
                                {event.type === 'alert' && (
                                  <>
                                    <div>
                                      <span className="text-slate-500">Stream:</span> {String(event.meta?.streamId ?? 'local')}
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Alert Type:</span> {String(event.meta?.alertType ?? 'n/a')}
                                    </div>
                                  </>
                                )}
                                {event.type === 'lost_found' && (
                                  <>
                                    <div>
                                      <span className="text-slate-500">Subject:</span> {String(event.meta?.subjectId ?? 'n/a')}
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Confidence:</span> {String(event.meta?.confidence ?? 'n/a')}%
                                    </div>
                                  </>
                                )}
                                {event.type === 'intrusion' && (
                                  <>
                                    <div>
                                      <span className="text-slate-500">Detected:</span> {String(event.meta?.personCount ?? 'n/a')}
                                    </div>
                                    <div>
                                      <span className="text-slate-500">Allowed:</span> {String(event.meta?.allowedCount ?? 'n/a')}
                                    </div>
                                  </>
                                )}
                              </div>

                              {(event.type === 'lost_found' || event.type === 'intrusion') && (
                                <div className="space-y-2">
                                  <label className="block text-xs text-slate-400">Notes</label>
                                  <textarea
                                    value={notesDraft}
                                    onChange={(e) => setNotesDraft(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="Add context, what you did, outcomes…"
                                  />
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      onClick={saveNotes}
                                      disabled={isSavingNotes}
                                      className="px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/30 transition-colors disabled:opacity-60"
                                    >
                                      {isSavingNotes ? 'Saving…' : 'Save Notes'}
                                    </button>
                                    {!exported && (
                                      <button
                                        onClick={markThisExported}
                                        className="px-3 py-1.5 text-xs font-medium bg-slate-700/40 text-slate-200 rounded hover:bg-slate-700 transition-colors"
                                      >
                                        Mark Exported
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </div>
        ) : viewMode === 'alerts' ? (
          <div className="space-y-3">
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <p className="text-slate-400">No alerts yet</p>
                <p className="text-sm text-slate-500 mt-1">Alerts will appear here when detected</p>
              </div>
            ) : (
              filteredAlerts.map((alert) => {
                const colors = severityColors[alert.severity];

                const handleAcknowledge = async () => {
                  try {
                    await fetch(`/api/alerts/${alert.id}/acknowledge`, { method: 'POST' });
                    setAlerts(prev => prev.map(a =>
                      a.id === alert.id ? { ...a, acknowledged: true, acknowledged_at: new Date().toISOString() } : a
                    ));
                  } catch (err) {
                    console.error('Failed to acknowledge:', err);
                  }
                };

                const handleDelete = async () => {
                  try {
                    await fetch(`/api/alerts/${alert.id}`, { method: 'DELETE' });
                    setAlerts(prev => prev.filter(a => a.id !== alert.id));
                  } catch (err) {
                    console.error('Failed to delete:', err);
                  }
                };

                return (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-xl border ${colors.border} ${colors.bg} group`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors.text} ${colors.bg}`}>
                            {alert.severity.toUpperCase()}
                          </span>
                          <span className="text-xs text-slate-500">{alert.alert_type}</span>
                        </div>
                        <p className="text-white">{alert.message}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDate(alert.created_at)}
                          {alert.acknowledged && (
                            <span className="ml-2 text-emerald-400">
                              ✓ Acknowledged
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!alert.acknowledged && (
                          <button
                            onClick={handleAcknowledge}
                            className="px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors"
                          >
                            Acknowledge
                          </button>
                        )}
                        <button
                          onClick={handleDelete}
                          className="p-1.5 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors"
                          aria-label="Delete alert"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAnalysis.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-slate-400">No analysis results yet</p>
                <p className="text-sm text-slate-500 mt-1">Start monitoring to see AI analysis</p>
              </div>
            ) : (
              filteredAnalysis.map((result) => {
                const colors = severityColors[result.concern_level];
                return (
                  <div
                    key={result.id}
                    className="p-4 rounded-xl border border-slate-700 bg-slate-800/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors.text} ${colors.bg}`}>
                            {result.concern_level.toUpperCase()}
                          </span>
                          <span className="text-xs text-slate-500">
                            {result.model_used} • {result.processing_time_ms}ms
                          </span>
                        </div>
                        <p className="text-white">{result.description}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatDate(result.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Stats */}
        {!loading && !activeError && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 text-center">
              <p className="text-2xl font-bold text-white">
                {viewMode === 'local'
                  ? localTimelineEvents.length
                  : viewMode === 'alerts'
                    ? alerts.length
                    : analysisResults.length}
              </p>
              <p className="text-sm text-slate-400">Total</p>
            </div>
            <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30 text-center">
              <p className="text-2xl font-bold text-red-400">
                {viewMode === 'local'
                  ? localTimelineEvents.filter((e) => e.severity === 'critical' || e.severity === 'high').length
                  : viewMode === 'alerts'
                    ? alerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length
                    : analysisResults.filter((a) => a.concern_level === 'critical' || a.concern_level === 'high').length}
              </p>
              <p className="text-sm text-red-400/70">Critical/High</p>
            </div>
            <div className="p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/30 text-center">
              <p className="text-2xl font-bold text-yellow-400">
                {viewMode === 'local'
                  ? localTimelineEvents.filter((e) => e.severity === 'medium').length
                  : viewMode === 'alerts'
                    ? alerts.filter((a) => a.severity === 'medium').length
                    : analysisResults.filter((a) => a.concern_level === 'medium').length}
              </p>
              <p className="text-sm text-yellow-400/70">Medium</p>
            </div>
            <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30 text-center">
              <p className="text-2xl font-bold text-green-400">
                {viewMode === 'local'
                  ? localTimelineEvents.filter((e) => !e.acknowledged).length
                  : viewMode === 'alerts'
                    ? alerts.filter((a) => !a.acknowledged).length
                    : analysisResults.filter((a) => a.concern_level === 'none' || a.concern_level === 'low').length}
              </p>
              <p className="text-sm text-green-400/70">
                {viewMode === 'local'
                  ? 'Unacknowledged'
                  : viewMode === 'alerts'
                    ? 'Pending'
                    : 'Low/None'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
