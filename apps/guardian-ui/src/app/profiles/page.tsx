/**
 * Profiles Page
 *
 * Manage monitoring profiles for different scenarios.
 *
 * @module app/profiles/page
 */

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CreateProfileModal, ProfileFormData } from '@/components/CreateProfileModal';

// =============================================================================
// Types
// =============================================================================

interface MonitoringProfile {
  id: string;
  name: string;
  scenario: 'pet' | 'baby' | 'elderly' | 'security';
  settings: {
    motionSensitivity: number;
    audioSensitivity: number;
    analysisInterval: number;
    cryDetection?: boolean;
    sleepMonitoring?: boolean;
    inactivityAlert?: boolean;
    barkDetection?: boolean;
    fallDetection?: boolean;
    helpDetection?: boolean;
  };
  is_active: boolean;
  created_at: string;
}

// =============================================================================
// Icons
// =============================================================================

const scenarioIcons: Record<string, React.ReactNode> = {
  pet: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  baby: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  elderly: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
};

const scenarioColors: Record<string, { bg: string; border: string; text: string }> = {
  pet: { bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-400' },
  baby: { bg: 'bg-pink-500/20', border: 'border-pink-500/30', text: 'text-pink-400' },
  elderly: { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-400' },
};

const scenarioDescriptions: Record<string, string> = {
  pet: 'Monitor pets for activity, distress, eating, and health indicators.',
  baby: 'Watch for crying, movement, breathing patterns, and sleep monitoring.',
  elderly: 'Detect falls, call for help, inactivity, and signs of confusion.',
};

// =============================================================================
// Component
// =============================================================================

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<MonitoringProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<MonitoringProfile | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/profiles');
      const data = await response.json();
      if (data.success) {
        setProfiles(data.data);
      } else {
        setError(data.error || 'Failed to fetch profiles');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivate = async (profileId: string) => {
    try {
      const response = await fetch(`/api/profiles/${profileId}/activate`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        // Update local state to reflect activation
        setProfiles((prev) =>
          prev.map((p) => ({
            ...p,
            is_active: p.id === profileId,
          }))
        );
      } else {
        setError(data.error || 'Failed to activate profile');
      }
    } catch (err) {
      setError('Failed to activate profile. Please try again.');
    }
  };

  const handleCreateProfile = async (data: ProfileFormData) => {
    const response = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to create profile');
    }

    // Add new profile to list and refresh
    await fetchProfiles();
  };

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
            <h1 className="text-xl font-bold text-white">Monitoring Profiles</h1>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Profile
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Intro */}
        <div className="mb-8 p-6 bg-slate-800/50 rounded-xl border border-slate-700/50">
          <h2 className="text-lg font-semibold text-white mb-2">What are Monitoring Profiles?</h2>
          <p className="text-slate-400">
            Profiles customize how SafeOS analyzes your camera feed. Each profile has optimized settings
            for detecting specific situations. Choose or create a profile that matches what you&apos;re monitoring.
          </p>
        </div>

        {/* Profiles Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400">{error}</p>
            <button
              onClick={fetchProfiles}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {profiles.map((profile) => {
              const colors = scenarioColors[profile.scenario];
              const isActive = profile.is_active;

              return (
                <div
                  key={profile.id}
                  className={`
                    relative p-6 rounded-xl border transition-all
                    ${isActive
                      ? `${colors.border} ${colors.bg}`
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }
                  `}
                >
                  {/* Active Badge */}
                  {isActive && (
                    <div className="absolute top-4 right-4">
                      <span className="px-2 py-1 text-xs font-medium bg-emerald-500 text-white rounded-full">
                        Active
                      </span>
                    </div>
                  )}

                  {/* Icon */}
                  <div className={`w-16 h-16 rounded-xl ${colors.bg} ${colors.text} flex items-center justify-center mb-4`}>
                    {scenarioIcons[profile.scenario]}
                  </div>

                  {/* Info */}
                  <h3 className="text-xl font-semibold text-white mb-1">{profile.name}</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    {scenarioDescriptions[profile.scenario]}
                  </p>

                  {/* Settings Preview */}
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Motion Sensitivity</span>
                      <span className="text-slate-300">{profile.settings.motionSensitivity}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Audio Sensitivity</span>
                      <span className="text-slate-300">{profile.settings.audioSensitivity}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Analysis Interval</span>
                      <span className="text-slate-300">{profile.settings.analysisInterval}s</span>
                    </div>
                  </div>

                  {/* Feature Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {profile.settings.cryDetection && (
                      <span className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                        Cry Detection
                      </span>
                    )}
                    {profile.settings.sleepMonitoring && (
                      <span className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                        Sleep Monitor
                      </span>
                    )}
                    {profile.settings.fallDetection && (
                      <span className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                        Fall Detection
                      </span>
                    )}
                    {profile.settings.helpDetection && (
                      <span className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                        Help Detection
                      </span>
                    )}
                    {profile.settings.barkDetection && (
                      <span className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                        Bark Detection
                      </span>
                    )}
                    {profile.settings.inactivityAlert && (
                      <span className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                        Inactivity Alert
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {!isActive && (
                      <button
                        onClick={() => handleActivate(profile.id)}
                        className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${colors.bg} ${colors.text} hover:opacity-80`}
                      >
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => setEditingProfile(profile)}
                      className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                      aria-label={`Edit ${profile.name} profile`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Create New Card */}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="p-6 rounded-xl border-2 border-dashed border-slate-700 hover:border-slate-500 transition-colors flex flex-col items-center justify-center text-center min-h-[300px]"
            >
              <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-400 mb-1">Create Custom Profile</h3>
              <p className="text-sm text-slate-500">
                Customize settings for your specific needs
              </p>
            </button>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 p-6 bg-blue-500/10 border border-blue-500/30 rounded-xl">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-blue-400 font-medium mb-1">Pro Tip: Profile Switching</h3>
              <p className="text-sm text-slate-300">
                You can quickly switch profiles during monitoring from the stream controls.
                This is useful if your monitoring needs change throughout the day.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Profile Modal */}
      <CreateProfileModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateProfile}
      />
    </div>
  );
}
