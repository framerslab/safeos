'use client';

/**
 * Dashboard Component
 *
 * Main monitoring dashboard with industrial, utilitarian design.
 * No emojis. Custom SVG icons. Monospace data displays.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useMonitoringStore } from '../stores/monitoring-store';
import { useWebSocket } from '../lib/websocket';
import { OnboardingWizard, useOnboarding } from './OnboardingWizard';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import {
  IconShieldCheck,
  IconCamera,
  IconAlertTriangle,
  IconActivity,
  IconServer,
  IconCpu,
  IconWifi,
  IconWifiOff,
  IconSettings,
  IconHistory,
  IconPlay,
  IconBell,
  IconChevronRight,
  IconPulse,
  IconRefresh,
  IconPaw,
  IconShield,
  IconWildlife,
} from './icons';
import { SafeOSLogo, SuperCloudLogo } from './Logo';

// =============================================================================
// Types
// =============================================================================

interface SystemStats {
  ollamaStatus: 'online' | 'offline';
  analysisQueueSize: number;
  activeStreams: number;
  cloudFallbackRate: number;
  systemHealth: 'healthy' | 'degraded' | 'offline' | 'local-only';
  framesAnalyzedToday: number;
  alertsToday: number;
  avgResponseTime: number;
}

// =============================================================================
// Dashboard Component
// =============================================================================

export function Dashboard() {
  const [stats, setStats] = useState<SystemStats>({
    ollamaStatus: 'offline',
    analysisQueueSize: 0,
    activeStreams: 0,
    cloudFallbackRate: 0,
    systemHealth: 'local-only',
    framesAnalyzedToday: 0,
    alertsToday: 0,
    avgResponseTime: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const { isStreaming, alerts, streams, addAlert } = useMonitoringStore();
  const { showOnboarding, isChecking, complete: completeOnboarding } = useOnboarding();
  const { status: backendStatus, config: backendConfig } = useBackendStatus();

  const canUseMonitoringServer = useMemo(
    () => backendStatus.api === 'connected' && !!backendConfig.apiUrl,
    [backendStatus.api, backendConfig.apiUrl]
  );

  const buildLocalStats = useCallback((): SystemStats => {
    const activeStreams = streams.filter((s) => s.status === 'active').length || (isStreaming ? 1 : 0);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const alertsToday = alerts.filter((a) => {
      const createdAt = a.createdAt || a.timestamp;
      if (!createdAt) return false;
      const ms = Date.parse(createdAt);
      return Number.isFinite(ms) && ms >= startOfDay;
    }).length;

    return {
      ollamaStatus: backendStatus.ollama === 'connected' ? 'online' : 'offline',
      analysisQueueSize: 0,
      activeStreams,
      cloudFallbackRate: 0,
      systemHealth: 'local-only',
      framesAnalyzedToday: 0,
      alertsToday,
      avgResponseTime: 0,
    };
  }, [alerts, backendStatus.ollama, isStreaming, streams]);

  const { sendMessage, isConnected } = useWebSocket(
    canUseMonitoringServer ? backendConfig.wsUrl : '',
    {
      onMessage: (message) => {
        if (message.type === 'alert') {
          addAlert(message.payload);
        } else if (message.type === 'stats') {
          setStats(message.payload);
          setLastUpdate(new Date());
        }
      },
    }
  );

  const fetchStats = useCallback(async () => {
    if (!canUseMonitoringServer || !backendConfig.apiUrl) {
      setStats(buildLocalStats());
      setLastUpdate(new Date());
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${backendConfig.apiUrl}/api/system/status`
      );
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, [backendConfig.apiUrl, buildLocalStats, canUseMonitoringServer]);

  useEffect(() => {
    fetchStats();
    if (!canUseMonitoringServer) return;

    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    if (canUseMonitoringServer && isConnected) {
      sendMessage({ type: 'subscribe', channel: 'stats' });
    }
  }, [canUseMonitoringServer, isConnected, sendMessage]);

  // Show loading while checking onboarding status
  if (isChecking) {
    return (
      <div className="min-h-screen bg-[var(--color-steel-950)] flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-steel-950)]">
      {/* Onboarding Wizard */}
      {showOnboarding && <OnboardingWizard onComplete={completeOnboarding} />}

      {/* Header */}
      <Header systemHealth={stats.systemHealth} />

      {/* Main Content */}
      <main className="container py-6">
        {loading ? (
          <LoadingState />
        ) : (
          <div className="grid gap-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Active Streams"
                value={stats.activeStreams}
                icon={<IconCamera size={20} />}
                status={stats.activeStreams > 0 ? 'active' : 'inactive'}
              />
              <StatCard
                label="Alerts Today"
                value={stats.alertsToday}
                icon={<IconBell size={20} />}
                status={stats.alertsToday > 0 ? 'warning' : 'inactive'}
              />
              <StatCard
                label="Queue Depth"
                value={stats.analysisQueueSize}
                icon={<IconActivity size={20} />}
                status={stats.analysisQueueSize > 10 ? 'warning' : 'active'}
              />
              <StatCard
                label="Avg Response"
                value={`${stats.avgResponseTime}ms`}
                icon={<IconCpu size={20} />}
              />
            </div>

            {/* Main Grid */}
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Left Column - Actions & Streams */}
              <div className="lg:col-span-2 space-y-6">
                <QuickActionsPanel isStreaming={isStreaming} />
                <ActiveStreamsPanel streamCount={stats.activeStreams} />
              </div>

              {/* Right Column - Status & Alerts */}
              <div className="space-y-6">
                <SystemStatusPanel stats={stats} />
                <RecentAlertsPanel alerts={alerts.slice(0, 5)} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer with API Status */}
      <footer className="border-t border-[var(--color-steel-800)] py-4 mt-auto">
        <div className="container flex items-center justify-between text-[var(--color-steel-500)]">
          <span className="font-mono text-xs uppercase tracking-wider">
            SafeOS Guardian v1.0
          </span>
          <div className="flex items-center gap-4">
            {/* Administrative API Monitoring */}
            <div className="flex items-center gap-2">
              {canUseMonitoringServer && isConnected ? (
                <IconWifi size={12} className="text-[var(--color-status-online)]" />
              ) : (
                <IconWifiOff size={12} className="text-[var(--color-steel-600)]" />
              )}
              <span className="font-mono text-xs text-[var(--color-steel-600)]">
                Monitoring Server: {!backendConfig.apiUrl ? 'Not configured' : isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <span className="font-mono text-xs">
              {lastUpdate.toLocaleTimeString()}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// =============================================================================
// Header Component
// =============================================================================

interface HeaderProps {
  systemHealth: 'healthy' | 'degraded' | 'offline' | 'local-only';
}

function Header({ systemHealth }: HeaderProps) {
  return (
    <header className="border-b border-[var(--color-steel-800)] bg-[var(--color-steel-900)]">
      <div className="container py-4">
        <div className="flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <SafeOSLogo size={40} className="text-[var(--color-accent-500)]" />
            <div>
              <h1 className="font-mono text-sm font-semibold text-[var(--color-steel-100)] uppercase tracking-wider">
                SafeOS Guardian
              </h1>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-[var(--color-steel-600)]">by</span>
                <SuperCloudLogo size={14} className="text-[#3B82F6]" />
                <span className="font-mono text-[10px] text-[var(--color-steel-500)]">SuperCloud</span>
              </div>
            </div>
          </div>

          {/* System Health */}
          <div className="flex items-center gap-2">
            <div
              className={`status-dot ${systemHealth === 'healthy'
                ? 'status-dot--online'
                : systemHealth === 'degraded'
                  ? 'status-dot--warning'
                  : systemHealth === 'local-only'
                    ? 'status-dot--warning'
                    : 'status-dot--offline'
                } ${systemHealth === 'healthy' ? 'status-dot--pulse' : ''}`}
            />
            <span className="font-mono text-xs text-[var(--color-steel-400)] uppercase">
              {systemHealth === 'local-only' ? 'local-only' : systemHealth}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

// =============================================================================
// Stat Card Component
// =============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  status?: 'active' | 'warning' | 'inactive';
}

function StatCard({ label, value, icon, status = 'inactive' }: StatCardProps) {
  const statusColors = {
    active: 'border-[var(--color-accent-600)]',
    warning: 'border-[var(--color-status-warning)]',
    inactive: 'border-[var(--color-steel-700)]',
  };

  return (
    <div className={`card border-l-2 ${statusColors[status]}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-label">{label}</span>
        <span className="text-[var(--color-steel-500)]">{icon}</span>
      </div>
      <div className="font-mono text-2xl font-semibold text-[var(--color-steel-100)]">
        {value}
      </div>
    </div>
  );
}

// =============================================================================
// Quick Actions Panel
// =============================================================================

function MoonIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}

interface QuickActionsPanelProps {
  isStreaming: boolean;
}

function QuickActionsPanel({ isStreaming }: QuickActionsPanelProps) {
  const actions = [
    {
      id: 'monitor',
      label: isStreaming ? 'View Stream' : 'Start Monitor',
      description: 'Begin surveillance session',
      href: '/monitor',
      icon: <IconPlay size={20} />,
      primary: true,
    },
    {
      id: 'nap',
      label: 'Nap Mode',
      description: 'Quick nap monitoring',
      href: '/nap',
      icon: <MoonIcon size={20} />,
      highlight: true,
    },
    {
      id: 'lost-found',
      label: 'Lost & Found',
      description: 'Watch your camera for a lost pet',
      href: '/lost-found',
      icon: <IconPaw size={20} />,
    },
    {
      id: 'security',
      label: 'Security',
      description: 'Counts the people in view',
      href: '/security',
      icon: <IconShield size={20} />,
    },
    {
      id: 'wildlife',
      label: 'Wildlife',
      description: 'Observe backyard visitors',
      href: '/wildlife',
      icon: <IconWildlife size={20} />,
    },
    {
      id: 'history',
      label: 'Alert History',
      description: 'View past events',
      href: '/history',
      icon: <IconHistory size={20} />,
    },
    {
      id: 'settings',
      label: 'Settings',
      description: 'Configure system',
      href: '/settings',
      icon: <IconSettings size={20} />,
    },
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-heading-sm">Quick Actions</h2>
      </div>
      <div className="panel-body">
        <div className="grid sm:grid-cols-3 gap-3">
          {actions.map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className={`card flex items-center gap-3 transition-colors hover:border-[var(--color-steel-500)] ${action.primary
                ? 'border-[var(--color-accent-700)] bg-[var(--color-accent-900)]/30'
                : ''
                }`}
            >
              <div
                className={`w-10 h-10 rounded flex items-center justify-center ${action.primary
                  ? 'bg-[var(--color-accent-600)] text-white'
                  : 'bg-[var(--color-steel-800)] text-[var(--color-steel-400)]'
                  }`}
              >
                {action.icon}
              </div>
              <div>
                <div className="font-mono text-sm font-medium text-[var(--color-steel-100)]">
                  {action.label}
                </div>
                <div className="text-xs text-[var(--color-steel-500)]">
                  {action.description}
                </div>
              </div>
              <IconChevronRight size={16} className="ml-auto text-[var(--color-steel-600)]" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Active Streams Panel
// =============================================================================

interface ActiveStreamsPanelProps {
  streamCount: number;
}

function ActiveStreamsPanel({ streamCount }: ActiveStreamsPanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-heading-sm flex items-center gap-2">
          <IconCamera size={16} className="text-[var(--color-steel-500)]" />
          Active Streams
        </h2>
        <Link
          href="/monitor"
          className="font-mono text-xs text-[var(--color-accent-500)] hover:text-[var(--color-accent-400)]"
        >
          + NEW
        </Link>
      </div>
      <div className="panel-body">
        {streamCount === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-[var(--color-steel-850)] border border-[var(--color-steel-700)] flex items-center justify-center">
              <IconCamera size={32} className="text-[var(--color-steel-600)]" />
            </div>
            <p className="font-mono text-sm text-[var(--color-steel-500)] mb-4">
              No active monitoring sessions
            </p>
            <Link href="/monitor" className="btn btn-primary">
              Start Monitoring
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Placeholder for stream cards */}
            <div className="text-sm text-[var(--color-steel-400)]">
              {streamCount} stream(s) active
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// System Status Panel
// =============================================================================

interface SystemStatusPanelProps {
  stats: SystemStats;
}

function SystemStatusPanel({ stats }: SystemStatusPanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-heading-sm flex items-center gap-2">
          <IconServer size={16} className="text-[var(--color-steel-500)]" />
          System Status
        </h2>
      </div>
      <div className="panel-body space-y-4">
        {/* Ollama Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconCpu size={16} className="text-[var(--color-steel-500)]" />
            <span className="text-sm text-[var(--color-steel-300)]">Local AI</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`status-dot ${stats.ollamaStatus === 'online' ? 'status-dot--online' : 'status-dot--offline'
                }`}
            />
            <span className="font-mono text-xs text-[var(--color-steel-400)] uppercase">
              {stats.ollamaStatus}
            </span>
          </div>
        </div>

        {/* Cloud Fallback */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-steel-300)]">Cloud Fallback</span>
          <span className="font-mono text-sm text-[var(--color-steel-100)]">
            {stats.cloudFallbackRate.toFixed(1)}%
          </span>
        </div>

        {/* Progress bar for cloud usage */}
        <div className="progress-bar">
          <div
            className="progress-bar__fill"
            style={{
              width: `${100 - stats.cloudFallbackRate}%`,
              backgroundColor:
                stats.cloudFallbackRate > 50
                  ? 'var(--color-status-warning)'
                  : 'var(--color-accent-500)',
            }}
          />
        </div>

        {/* Frames Analyzed */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-steel-800)]">
          <span className="text-sm text-[var(--color-steel-300)]">Frames Analyzed</span>
          <span className="font-mono text-sm text-[var(--color-steel-100)]">
            {stats.framesAnalyzedToday.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Recent Alerts Panel
// =============================================================================

interface Alert {
  id: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  createdAt?: string;
  timestamp?: string;
  acknowledged?: boolean;
}

interface RecentAlertsPanelProps {
  alerts: Alert[];
}

function RecentAlertsPanel({ alerts }: RecentAlertsPanelProps) {
  const removeAlert = useMonitoringStore((state) => state.removeAlert);
  const acknowledgeAlert = useMonitoringStore((state) => state.acknowledgeAlert);
  const clearAlerts = useMonitoringStore((state) => state.clearAlerts);

  const severityColors = {
    critical: 'text-[var(--color-alert-critical)]',
    high: 'text-[var(--color-alert-high)]',
    medium: 'text-[var(--color-alert-medium)]',
    low: 'text-[var(--color-alert-low)]',
    info: 'text-[var(--color-steel-500)]',
  };

  const handleDismiss = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    removeAlert(alertId);
  };

  const handleAcknowledge = (alertId: string) => {
    acknowledgeAlert(alertId);
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-heading-sm flex items-center gap-2">
          <IconAlertTriangle size={16} className="text-[var(--color-steel-500)]" />
          Recent Alerts
        </h2>
        <div className="flex items-center gap-2">
          {alerts.length > 0 && (
            <button
              onClick={clearAlerts}
              className="font-mono text-xs text-[var(--color-steel-500)] hover:text-[var(--color-steel-300)] transition-colors"
              title="Clear all alerts"
            >
              CLEAR ALL
            </button>
          )}
          <Link
            href="/history"
            className="font-mono text-xs text-[var(--color-accent-500)] hover:text-[var(--color-accent-400)]"
          >
            VIEW ALL
          </Link>
        </div>
      </div>
      <div className="panel-body">
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-steel-500)]">
            <IconBell size={24} className="mx-auto mb-2 opacity-50" />
            <p className="font-mono text-xs">No recent alerts</p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                onClick={() => !alert.acknowledged && handleAcknowledge(alert.id)}
                className={`group flex items-start gap-3 p-2 rounded border transition-colors ${alert.acknowledged
                    ? 'bg-[var(--color-steel-900)] border-[var(--color-steel-800)] opacity-60'
                    : 'bg-[var(--color-steel-850)] border-[var(--color-steel-800)] hover:border-[var(--color-steel-600)] cursor-pointer'
                  }`}
              >
                {alert.acknowledged ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0 text-emerald-500">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <IconAlertTriangle
                    size={16}
                    className={`mt-0.5 flex-shrink-0 ${severityColors[alert.severity]}`}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${alert.acknowledged ? 'text-[var(--color-steel-400)]' : 'text-[var(--color-steel-200)]'}`}>
                    {alert.message}
                  </p>
                  <p className="font-mono text-xs text-[var(--color-steel-500)]">
                    {new Date(alert.createdAt || alert.timestamp || new Date()).toLocaleTimeString()}
                    {alert.acknowledged && (
                      <span className="ml-2 text-emerald-500 inline-flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        Acknowledged
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDismiss(e, alert.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--color-steel-700)] text-[var(--color-steel-500)] hover:text-white transition-all"
                  aria-label="Dismiss alert"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Loading State
// =============================================================================

function LoadingState() {
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card">
            <div className="skeleton h-4 w-20 mb-3" />
            <div className="skeleton h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="panel">
            <div className="panel-body">
              <div className="skeleton h-32 w-full" />
            </div>
          </div>
        </div>
        <div>
          <div className="panel">
            <div className="panel-body">
              <div className="skeleton h-48 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
