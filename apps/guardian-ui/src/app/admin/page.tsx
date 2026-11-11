/**
 * Admin Dashboard
 *
 * System administration and human review interface.
 *
 * @module app/admin/page
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/env';
import { useAuthStore } from '@/stores/auth-store';
import { IconCamera, IconLock, IconCheck } from '../../components/icons';

// =============================================================================
// Types
// =============================================================================

interface SystemMetrics {
  uptime: number;
  totalStreams: number;
  activeStreams: number;
  totalAlerts: number;
  pendingReviews: number;
  analysisToday: number;
  cloudFallbackRate: number;
  avgResponseTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

interface ContentFlag {
  id: string;
  streamId: string;
  category: string;
  tier: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  createdAt: string;
  thumbnailUrl?: string;
}

interface RecentActivity {
  id: string;
  type: 'alert' | 'review' | 'stream' | 'system';
  message: string;
  timestamp: string;
  severity?: 'info' | 'warning' | 'error';
}

interface Stream {
  id: string;
  scenario: 'pet' | 'baby' | 'elderly';
  status: 'active' | 'paused' | 'ended' | 'banned';
  createdAt: string;
  updatedAt: string;
  alertCount?: number;
  lastActivity?: string;
}

interface User {
  id: string;
  email?: string;
  deviceId?: string;
  displayName?: string;
  role: 'admin' | 'user' | 'viewer';
  status: 'active' | 'suspended' | 'banned';
  createdAt: string;
  lastActive?: string;
  streamCount?: number;
}

type AdminTab = 'overview' | 'reviews' | 'streams' | 'users' | 'system' | 'logs';

// =============================================================================
// Component
// =============================================================================

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [flags, setFlags] = useState<ContentFlag[]>([]);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [statusRes, flagsRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/status`, { headers: { 'X-Session-Token': useAuthStore.getState().sessionToken || '' } }),
        fetch(`${getApiUrl()}/api/review/flags?limit=20`, { headers: { 'X-Session-Token': useAuthStore.getState().sessionToken || '' } }),
      ]);

      if (statusRes.ok) {
        const status = await statusRes.json();
        setMetrics({
          uptime: status.uptime || 0,
          totalStreams: status.stats?.totalStreams || 0,
          activeStreams: status.stats?.activeStreams || 0,
          totalAlerts: status.stats?.totalAlerts || 0,
          pendingReviews: status.stats?.pendingReviews || 0,
          analysisToday: status.stats?.analysisToday || 0,
          cloudFallbackRate: status.stats?.cloudFallbackRate || 0,
          avgResponseTime: status.stats?.avgResponseTime || 0,
          memoryUsage: status.stats?.memoryUsage || 0,
          cpuUsage: status.stats?.cpuUsage || 0,
        });
      }

      if (flagsRes.ok) {
        const flagsData = await flagsRes.json();
        setFlags((flagsData.flags || []).map((flag: Omit<ContentFlag, 'streamId' | 'createdAt'> & {
          stream_id: string;
          created_at: string;
        }) => ({ ...flag, streamId: flag.stream_id, createdAt: flag.created_at })));
      }

      // Mock activities for now
      setActivities([
        { id: '1', type: 'alert', message: 'High concern alert triggered', timestamp: new Date().toISOString(), severity: 'warning' },
        { id: '2', type: 'stream', message: 'New stream started', timestamp: new Date(Date.now() - 60000).toISOString(), severity: 'info' },
        { id: '3', type: 'review', message: 'Content flag approved', timestamp: new Date(Date.now() - 120000).toISOString(), severity: 'info' },
      ]);
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFlagAction = async (flagId: string, action: 'approve' | 'reject' | 'escalate') => {
    setReviewError(null);
    try {
      const response = await fetch(`${getApiUrl()}/api/review/flags/${flagId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Token': useAuthStore.getState().sessionToken || '' },
        body: JSON.stringify({ action: { approve: 'approved', reject: 'rejected', escalate: 'escalated' }[action] }),
      });
      if (!response.ok) throw new Error('Review action was not accepted. Please try again.');
      await fetchData();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Could not save review action.');
      console.error('Failed to action flag:', error);
    }
  };

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    )},
    { id: 'reviews', label: 'Reviews', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )},
    { id: 'streams', label: 'Streams', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    )},
    { id: 'users', label: 'Users', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )},
    { id: 'system', label: 'System', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    )},
    { id: 'logs', label: 'Logs', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    )},
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {reviewError && <p role="alert" className="p-4 text-red-400">{reviewError}</p>}
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-800/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-slate-400 hover:text-white transition-colors" aria-label="Go back to dashboard">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
                <p className="text-xs text-slate-400">System management & human review</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Pending Reviews Badge */}
              {metrics && metrics.pendingReviews > 0 && (
                <div className="px-3 py-1.5 bg-orange-500/20 border border-orange-500/30 rounded-lg">
                  <span className="text-orange-400 text-sm font-medium">
                    {metrics.pendingReviews} pending reviews
                  </span>
                </div>
              )}

              {/* System Status */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-slate-300">System Healthy</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <nav className="w-48 flex-shrink-0">
            <ul className="space-y-1">
              {tabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                    {tab.id === 'reviews' && metrics && metrics.pendingReviews > 0 && (
                      <span className="ml-auto bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {metrics.pendingReviews}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Main Content */}
          <main className="flex-1">
            {isLoading ? (
              <LoadingState />
            ) : (
              <>
                {activeTab === 'overview' && (
                  <OverviewTab metrics={metrics} activities={activities} />
                )}
                {activeTab === 'reviews' && (
                  <ReviewsTab flags={flags} onAction={handleFlagAction} />
                )}
                {activeTab === 'streams' && <StreamsTab />}
                {activeTab === 'users' && <UsersTab />}
                {activeTab === 'system' && <SystemTab metrics={metrics} />}
                {activeTab === 'logs' && <LogsTab />}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Tab Components
// =============================================================================

function OverviewTab({ metrics, activities }: { metrics: SystemMetrics | null; activities: RecentActivity[] }) {
  if (!metrics) return null;

  const stats: Array<{ label: string; value: number; icon: React.ReactNode; color: string }> = [
    { label: 'Active Streams', value: metrics.activeStreams, icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ), color: 'from-blue-500 to-cyan-500' },
    { label: 'Pending Reviews', value: metrics.pendingReviews, icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ), color: 'from-orange-500 to-amber-500' },
    { label: 'Analysis Today', value: metrics.analysisToday, icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ), color: 'from-purple-500 to-pink-500' },
    { label: 'Total Alerts', value: metrics.totalAlerts, icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ), color: 'from-red-500 to-orange-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-slate-400">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Performance Chart */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-white font-semibold mb-4">System Performance</h3>
          <div className="space-y-4">
            <ProgressBar label="CPU Usage" value={metrics.cpuUsage} max={100} unit="%" />
            <ProgressBar label="Memory" value={metrics.memoryUsage} max={100} unit="%" />
            <ProgressBar label="Cloud Fallback" value={metrics.cloudFallbackRate} max={100} unit="%" warning={metrics.cloudFallbackRate > 20} />
            <ProgressBar label="Avg Response" value={metrics.avgResponseTime} max={5000} unit="ms" />
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-white font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  activity.severity === 'error' ? 'bg-red-500' :
                  activity.severity === 'warning' ? 'bg-yellow-500' : 'bg-emerald-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{activity.message}</p>
                  <p className="text-xs text-slate-500">{formatTime(activity.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Uptime */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">System Uptime</h3>
            <p className="text-3xl font-bold text-emerald-400 mt-2">{formatUptime(metrics.uptime)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">Last restart</p>
            <p className="text-sm text-slate-300">{new Date(Date.now() - metrics.uptime * 1000).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewsTab({ flags, onAction }: { flags: ContentFlag[]; onAction: (id: string, action: 'approve' | 'reject' | 'escalate') => void }) {
  const pendingFlags = flags.filter((f) => f.status === 'pending');
  const resolvedFlags = flags.filter((f) => f.status !== 'pending');

  const tierLabels: Record<number, { label: string; color: string }> = {
    1: { label: 'Low', color: 'bg-green-500/20 text-green-400' },
    2: { label: 'Medium', color: 'bg-yellow-500/20 text-yellow-400' },
    3: { label: 'High', color: 'bg-orange-500/20 text-orange-400' },
    4: { label: 'Critical', color: 'bg-red-500/20 text-red-400' },
  };

  return (
    <div className="space-y-6">
      {/* Pending Reviews */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
          <h3 className="text-white font-semibold">Pending Reviews ({pendingFlags.length})</h3>
          <span className="text-xs text-slate-500">Content is anonymized for reviewer privacy</span>
        </div>

        {pendingFlags.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <IconCheck size={28} strokeWidth={2.5} />
            </div>
            <p className="text-slate-400">All caught up! No pending reviews.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {pendingFlags.map((flag) => {
              const tier = tierLabels[flag.tier] || tierLabels[1];
              return (
                <div key={flag.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Thumbnail placeholder */}
                    <div className="w-24 h-24 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 text-slate-400">
                      <IconLock size={28} className="opacity-60" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${tier.color}`}>
                          Tier {flag.tier}: {tier.label}
                        </span>
                        <span className="text-xs text-slate-500">{flag.category}</span>
                      </div>
                      <p className="text-white mb-1">{flag.reason}</p>
                      <p className="text-xs text-slate-500">
                        Stream: {flag.streamId.slice(0, 8)}... • {formatTime(flag.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => onAction(flag.id, 'approve')}
                        className="px-3 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => onAction(flag.id, 'reject')}
                        className="px-3 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => onAction(flag.id, 'escalate')}
                        className="px-3 py-2 bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition-colors text-sm"
                      >
                        Escalate
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently Resolved */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-700/50">
          <h3 className="text-white font-semibold">Recently Resolved</h3>
        </div>
        <div className="p-4">
          {resolvedFlags.length === 0 ? (
            <p className="text-slate-500 text-sm">No resolved reviews yet.</p>
          ) : (
            <div className="space-y-2">
              {resolvedFlags.slice(0, 5).map((flag) => (
                <div key={flag.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                  <div>
                    <span className="text-sm text-white">{flag.category}</span>
                    <span className="text-xs text-slate-500 ml-2">{formatTime(flag.createdAt)}</span>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded ${
                    flag.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' :
                    flag.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                    'bg-orange-500/20 text-orange-400'
                  }`}>
                    {flag.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StreamsTab() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'ended'>('all');

  useEffect(() => {
    fetchStreams();
  }, []);

  const fetchStreams = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/streams');
      if (res.ok) {
        const data = await res.json();
        setStreams(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch streams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStreamAction = async (streamId: string, action: 'pause' | 'resume' | 'end' | 'ban') => {
    try {
      const statusMap: Record<string, string> = {
        pause: 'paused',
        resume: 'active',
        end: 'ended',
        ban: 'banned',
      };
      await fetch(`/api/streams/${streamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusMap[action] }),
      });
      fetchStreams();
    } catch (error) {
      console.error('Failed to update stream:', error);
    }
  };

  const filteredStreams = filter === 'all'
    ? streams
    : streams.filter((s) => s.status === filter);

  const scenarioIcons: Record<string, React.ReactNode> = {
    pet: (
      <svg className="w-4 h-4 inline" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="11" cy="4" r="2" />
        <circle cx="18" cy="8" r="2" />
        <circle cx="4" cy="8" r="2" />
        <circle cx="9" cy="12" r="2" />
        <circle cx="15" cy="12" r="2" />
        <ellipse cx="12" cy="19" rx="5" ry="4" />
      </svg>
    ),
    baby: (
      <svg className="w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 1 0-16 0" />
      </svg>
    ),
    elderly: (
      <svg className="w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="6" r="4" />
        <path d="M20 21a8 8 0 1 0-16 0" />
        <path d="M12 10v4" />
      </svg>
    ),
  };

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    ended: 'bg-slate-500/20 text-slate-400',
    banned: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(['all', 'active', 'paused', 'ended'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                filter === f
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={fetchStreams}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : filteredStreams.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-10 h-10 mx-auto opacity-50 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <p className="text-slate-500 mt-2">No streams found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">ID</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Scenario</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Alerts</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Created</th>
                <th className="text-right p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filteredStreams.map((stream) => (
                <tr key={stream.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="p-4">
                    <span className="text-sm font-mono text-white">{stream.id.slice(0, 8)}...</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span>{scenarioIcons[stream.scenario] || <IconCamera size={16} className="inline" />}</span>
                      <span className="text-sm text-white capitalize">{stream.scenario}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded capitalize ${statusColors[stream.status]}`}>
                      {stream.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-slate-300">{stream.alertCount || 0}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-slate-400">{formatTime(stream.createdAt)}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {stream.status === 'active' && (
                        <button
                          onClick={() => handleStreamAction(stream.id, 'pause')}
                          className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
                        >
                          Pause
                        </button>
                      )}
                      {stream.status === 'paused' && (
                        <button
                          onClick={() => handleStreamAction(stream.id, 'resume')}
                          className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors"
                        >
                          Resume
                        </button>
                      )}
                      {(stream.status === 'active' || stream.status === 'paused') && (
                        <button
                          onClick={() => handleStreamAction(stream.id, 'end')}
                          className="px-2 py-1 text-xs bg-slate-500/20 text-slate-400 rounded hover:bg-slate-500/30 transition-colors"
                        >
                          End
                        </button>
                      )}
                      {stream.status !== 'banned' && (
                        <button
                          onClick={() => handleStreamAction(stream.id, 'ban')}
                          className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                        >
                          Ban
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 text-center">
          <p className="text-2xl font-bold text-white">{streams.length}</p>
          <p className="text-xs text-slate-400">Total Streams</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{streams.filter((s) => s.status === 'active').length}</p>
          <p className="text-xs text-slate-400">Active</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{streams.filter((s) => s.status === 'paused').length}</p>
          <p className="text-xs text-slate-400">Paused</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{streams.filter((s) => s.status === 'banned').length}</p>
          <p className="text-xs text-slate-400">Banned</p>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended' | 'banned'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user' | 'viewer'>('all');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/sessions');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserAction = async (userId: string, action: 'activate' | 'suspend' | 'ban' | 'delete' | 'promote' | 'demote') => {
    try {
      if (action === 'delete') {
        await fetch(`/api/auth/sessions/${userId}`, { method: 'DELETE' });
      } else if (action === 'promote') {
        await fetch(`/api/auth/sessions/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'admin' }),
        });
      } else if (action === 'demote') {
        await fetch(`/api/auth/sessions/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'user' }),
        });
      } else {
        const statusMap: Record<string, string> = {
          activate: 'active',
          suspend: 'suspended',
          ban: 'banned',
        };
        await fetch(`/api/auth/sessions/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: statusMap[action] }),
        });
      }
      fetchUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  const filteredUsers = users
    .filter((u) => filter === 'all' || u.status === filter)
    .filter((u) => roleFilter === 'all' || u.role === roleFilter);

  const roleIcons: Record<string, React.ReactNode> = {
    admin: (
      <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L9 8.5 2 9.3l5 4.9-1.2 7L12 17.8l6.2 3.4L17 14.2l5-4.9-7-.8L12 2z" />
      </svg>
    ),
    user: (
      <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    viewer: (
      <svg className="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-500/20 text-purple-400',
    user: 'bg-blue-500/20 text-blue-400',
    viewer: 'bg-slate-500/20 text-slate-400',
  };

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400',
    suspended: 'bg-yellow-500/20 text-yellow-400',
    banned: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Status:</span>
            {(['all', 'active', 'suspended', 'banned'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                  filter === f
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Role:</span>
            {(['all', 'admin', 'user', 'viewer'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                  roleFilter === r
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={fetchUsers}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-10 h-10 mx-auto opacity-50 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-slate-500 mt-2">No users found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">User</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Role</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Streams</th>
                <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Last Active</th>
                <th className="text-right p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">
                        {user.displayName || user.email || `Device: ${user.deviceId?.slice(0, 8)}...`}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {user.id.slice(0, 8)}...
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded capitalize ${roleColors[user.role]}`}>
                      <span>{roleIcons[user.role]}</span>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded capitalize ${statusColors[user.status]}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-slate-300">{user.streamCount || 0}</span>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-slate-400">
                      {user.lastActive ? formatTime(user.lastActive) : 'Never'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {/* Status actions */}
                      {user.status === 'active' && (
                        <button
                          onClick={() => handleUserAction(user.id, 'suspend')}
                          className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
                        >
                          Suspend
                        </button>
                      )}
                      {user.status === 'suspended' && (
                        <button
                          onClick={() => handleUserAction(user.id, 'activate')}
                          className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors"
                        >
                          Activate
                        </button>
                      )}
                      {user.status !== 'banned' && (
                        <button
                          onClick={() => handleUserAction(user.id, 'ban')}
                          className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                        >
                          Ban
                        </button>
                      )}
                      {/* Role actions */}
                      {user.role !== 'admin' && (
                        <button
                          onClick={() => handleUserAction(user.id, 'promote')}
                          className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
                          aria-label="Promote to Admin"
                        >
                          <span aria-hidden="true">↑</span>
                        </button>
                      )}
                      {user.role === 'admin' && (
                        <button
                          onClick={() => handleUserAction(user.id, 'demote')}
                          className="px-2 py-1 text-xs bg-slate-500/20 text-slate-400 rounded hover:bg-slate-500/30 transition-colors"
                          aria-label="Demote to User"
                        >
                          <span aria-hidden="true">↓</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 text-center">
          <p className="text-2xl font-bold text-white">{users.length}</p>
          <p className="text-xs text-slate-400">Total Users</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{users.filter((u) => u.status === 'active').length}</p>
          <p className="text-xs text-slate-400">Active</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">{users.filter((u) => u.role === 'admin').length}</p>
          <p className="text-xs text-slate-400">Admins</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{users.filter((u) => u.status === 'banned').length}</p>
          <p className="text-xs text-slate-400">Banned</p>
        </div>
      </div>
    </div>
  );
}

function SystemTab({ metrics }: { metrics: SystemMetrics | null }) {
  return (
    <div className="space-y-6">
      {/* Ollama Status */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <circle cx="8" cy="16" r="1" />
            <circle cx="16" cy="16" r="1" />
          </svg>
          Local AI (Ollama)
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-700/30 rounded-lg">
            <p className="text-sm text-slate-400 mb-1">Status</p>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-white font-medium">Online</span>
            </div>
          </div>
          <div className="p-4 bg-slate-700/30 rounded-lg">
            <p className="text-sm text-slate-400 mb-1">Models Loaded</p>
            <p className="text-white font-medium">moondream, llava:7b</p>
          </div>
        </div>
      </div>

      {/* Queue Status */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
          Queue Status
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-700/30 rounded-lg text-center">
            <p className="text-3xl font-bold text-blue-400">0</p>
            <p className="text-sm text-slate-400">Analysis Queue</p>
          </div>
          <div className="p-4 bg-slate-700/30 rounded-lg text-center">
            <p className="text-3xl font-bold text-purple-400">0</p>
            <p className="text-sm text-slate-400">Alert Queue</p>
          </div>
          <div className="p-4 bg-slate-700/30 rounded-lg text-center">
            <p className="text-3xl font-bold text-orange-400">{metrics?.pendingReviews || 0}</p>
            <p className="text-sm text-slate-400">Review Queue</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm">
            Clear Analysis Queue
          </button>
          <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm">
            Restart Ollama
          </button>
          <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm">
            Run Cleanup
          </button>
          <button className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors text-sm">
            Emergency Stop All
          </button>
        </div>
      </div>
    </div>
  );
}

function LogsTab() {
  const [logs] = useState([
    { timestamp: new Date().toISOString(), level: 'info', message: 'System started successfully' },
    { timestamp: new Date(Date.now() - 5000).toISOString(), level: 'info', message: 'Ollama connection established' },
    { timestamp: new Date(Date.now() - 10000).toISOString(), level: 'warning', message: 'High memory usage detected' },
    { timestamp: new Date(Date.now() - 15000).toISOString(), level: 'info', message: 'Frame analysis completed' },
    { timestamp: new Date(Date.now() - 20000).toISOString(), level: 'error', message: 'Cloud fallback triggered' },
  ]);

  const levelColors: Record<string, string> = {
    info: 'text-blue-400',
    warning: 'text-yellow-400',
    error: 'text-red-400',
  };

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-white font-semibold">System Logs</h3>
        <div className="flex items-center gap-2">
          <select className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white">
            <option>All Levels</option>
            <option>Info</option>
            <option>Warning</option>
            <option>Error</option>
          </select>
          <button className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">
            Export
          </button>
        </div>
      </div>

      <div className="font-mono text-sm divide-y divide-slate-700/30">
        {logs.map((log, i) => (
          <div key={i} className="px-4 py-3 hover:bg-slate-700/30 transition-colors">
            <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
            <span className={`ml-4 ${levelColors[log.level]}`}>[{log.level.toUpperCase()}]</span>
            <span className="ml-4 text-slate-300">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-4 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  );
}

function ProgressBar({ label, value, max, unit, warning = false }: { label: string; value: number; max: number; unit: string; warning?: boolean }) {
  const percentage = Math.min((value / max) * 100, 100);
  const color = warning || percentage > 80 ? 'bg-red-500' : percentage > 60 ? 'bg-yellow-500' : 'bg-emerald-500';

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300">{typeof value === 'number' ? value.toFixed(1) : value}{unit}</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}





























