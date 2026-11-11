/**
 * System Status Component
 *
 * Displays system health and status information.
 *
 * @module components/SystemStatus
 */

'use client';

import { getServerModelStatus } from '@/lib/server-model-status';
import { useState, useEffect } from 'react';
import { useBackendStatus } from '@/contexts/BackendStatusContext';

// =============================================================================
// Types
// =============================================================================

interface SystemStats {
  activeStreams: number;
  totalAlerts: number;
  pendingAlerts: number;
  systemHealth: 'healthy' | 'degraded' | 'offline';
  ollamaStatus: 'online' | 'offline';
  analysisQueueSize: number;
  cloudFallbackRate: number;
  // Extended stats
  framesAnalyzedToday?: number;
  alertsToday?: number;
  avgResponseTime?: number;
  memoryUsage?: number;
  gpuUsage?: number;
  storageUsed?: number;
  storageTotal?: number;
}

interface OllamaModel {
  name: string;
  size: string;
  loaded: boolean;
}

interface SystemStatusProps {
  stats: SystemStats;
}

// =============================================================================
// SystemStatus Component
// =============================================================================

export function SystemStatus({ stats }: SystemStatusProps) {
  const [expanded, setExpanded] = useState(false);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const { status: backendStatus, config: backendConfig } = useBackendStatus();

  // Fetch Ollama models when expanded
  useEffect(() => {
    if (!expanded) return;

    if (!backendConfig.apiUrl || backendStatus.ollama !== 'connected') {
      setModels([]);
      return;
    }

    setLoadingModels(true);
    let cancelled = false;
    getServerModelStatus(backendConfig.apiUrl)
      .then((status) => {
        if (!cancelled) setModels(status.models.map((model) => ({
          name: model.name, size: model.size || '—', loaded: false,
        })));
      })
      .catch(() => { if (!cancelled) setModels([]); })
      .finally(() => { if (!cancelled) setLoadingModels(false); });

    return () => { cancelled = true; };
  }, [backendConfig.apiUrl, backendStatus.ollama, expanded]);

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            System Status
          </h3>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse system details' : 'Expand system details'}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {expanded ? (
                <polyline points="18 15 12 9 6 15" />
              ) : (
                <polyline points="6 9 12 15 18 9" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Status Items */}
      <div className="p-4 space-y-3">
        {/* Overall Health */}
        <StatusItem
          label="System Health"
          status={stats.systemHealth}
          statusColors={{
            healthy: 'bg-emerald-500',
            degraded: 'bg-yellow-500',
            offline: 'bg-red-500',
          }}
        />

        {/* Ollama */}
        <StatusItem
          label="Local AI (Ollama)"
          status={stats.ollamaStatus}
          statusColors={{
            online: 'bg-emerald-500',
            offline: 'bg-red-500',
          }}
        />

        {/* Analysis Queue */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Analysis Queue</span>
          <span
            className={`text-sm font-medium ${
              stats.analysisQueueSize > 10
                ? 'text-yellow-400'
                : stats.analysisQueueSize > 0
                  ? 'text-blue-400'
                  : 'text-slate-300'
            }`}
          >
            {stats.analysisQueueSize} pending
          </span>
        </div>

        {/* Cloud Fallback Rate */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Cloud Fallback</span>
          <span
            className={`text-sm font-medium ${
              stats.cloudFallbackRate > 50
                ? 'text-orange-400'
                : stats.cloudFallbackRate > 20
                  ? 'text-yellow-400'
                  : 'text-emerald-400'
            }`}
          >
            {stats.cloudFallbackRate.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-slate-700/50 p-4 space-y-4">
          {/* Ollama Models */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              AI Models
            </h4>
            {loadingModels ? (
              <div className="text-sm text-slate-500">Loading models...</div>
            ) : models.length > 0 ? (
              <div className="space-y-2">
                {models.map((model) => (
                  <div
                    key={model.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-300">{model.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{model.size}</span>
                      <div
                        className={`w-2 h-2 rounded-full ${
                          model.loaded ? 'bg-emerald-500' : 'bg-slate-600'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                {backendConfig.ollamaUrl && backendStatus.ollama === 'connected'
                  ? 'No models installed'
                  : 'Ollama is offline'}
              </div>
            )}
          </div>

          {/* Resource Usage */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Resource Usage
            </h4>
            <ResourceBar label="Memory" value={stats.memoryUsage ?? 0} max={100} unit="%" />
            <ResourceBar label="GPU" value={stats.gpuUsage ?? 0} max={100} unit="%" />
            <ResourceBar label="Storage" value={stats.storageUsed ?? 0} max={stats.storageTotal ?? 16} unit="GB" />
          </div>

          {/* Analysis Stats */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Today&apos;s Stats
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-slate-700/50 rounded-lg p-2">
                <div className="text-lg font-bold text-white">
                  {formatNumber(stats.framesAnalyzedToday ?? 0)}
                </div>
                <div className="text-xs text-slate-400">Frames Analyzed</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-2">
                <div className="text-lg font-bold text-white">
                  {stats.alertsToday ?? 0}
                </div>
                <div className="text-xs text-slate-400">Alerts Generated</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-2">
                <div className="text-lg font-bold text-white">
                  {stats.avgResponseTime ?? 0}ms
                </div>
                <div className="text-xs text-slate-400">Avg Response</div>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-2">
                <div className="text-lg font-bold text-white">
                  {(100 - (stats.cloudFallbackRate ?? 0)).toFixed(0)}%
                </div>
                <div className="text-xs text-slate-400">Local Processing</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

// =============================================================================
// Sub-components
// =============================================================================

interface StatusItemProps {
  label: string;
  status: string;
  statusColors: Record<string, string>;
}

function StatusItem({ label, status, statusColors }: StatusItemProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusColors[status] || 'bg-slate-600'}`} />
        <span className="text-sm text-slate-300 capitalize">{status}</span>
      </div>
    </div>
  );
}

interface ResourceBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
}

function ResourceBar({ label, value, max, unit }: ResourceBarProps) {
  const percentage = (value / max) * 100;
  const color =
    percentage > 80
      ? 'bg-red-500'
      : percentage > 60
        ? 'bg-yellow-500'
        : 'bg-emerald-500';

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300">
          {value}
          {unit}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default SystemStatus;
































