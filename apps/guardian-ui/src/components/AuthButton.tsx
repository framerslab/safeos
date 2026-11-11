/**
 * Auth Button Component
 *
 * Shows login/signup or profile button based on auth state.
 *
 * @module components/AuthButton
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/auth-store';

// =============================================================================
// Component
// =============================================================================

export function AuthButton() {
  const { isAuthenticated, isGuest, profile, initialize, createSession, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update display name when profile changes
  useEffect(() => {
    if (profile?.displayName) {
      setDisplayName(profile.displayName);
    }
  }, [profile]);

  const handleSaveDisplayName = async () => {
    if (displayName.trim()) {
      const { updateProfile } = useAuthStore.getState();
      await updateProfile({ displayName: displayName.trim() });
      setIsEditing(false);
    }
  };

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
      setIsOpen(false);
    } catch {
      setLogoutError('Local data could not be cleared. Please try signing out again.');
    }
  };

  // Avatar initials
  const initials = profile?.displayName
    ? profile.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'G';

  return (
    <div className="relative" ref={dropdownRef}>
      {logoutError && <p role="alert">{logoutError}</p>}
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Account menu for ${profile?.displayName || 'Guest'}`}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white text-sm font-medium">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        {/* Name */}
        <span className="text-sm text-white hidden sm:inline">
          {profile?.displayName || 'Guest'}
        </span>

        {/* Guest badge */}
        {isGuest && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 hidden sm:inline">
            Guest
          </span>
        )}

        {/* Dropdown arrow */}
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div role="menu" className="absolute right-0 mt-2 w-72 bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden z-50">
          {/* Header */}
          <div className="p-4 bg-slate-700/50 border-b border-slate-600">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white text-lg font-medium">
                {initials}
              </div>
              <div className="flex-1">
                {isEditing ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm bg-slate-600 border border-slate-500 rounded text-white"
                      placeholder="Enter name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveDisplayName();
                        if (e.key === 'Escape') setIsEditing(false);
                      }}
                    />
                    <button
                      onClick={handleSaveDisplayName}
                      className="px-2 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{profile?.displayName}</span>
                    <button
                      onClick={() => setIsEditing(true)}
                      aria-label="Edit display name"
                      className="text-slate-400 hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                )}
                {isGuest && (
                  <p className="text-xs text-slate-400 mt-1">Guest session • Local data only</p>
                )}
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="p-2">
            <a
              href="/settings"
              role="menuitem"
              className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </a>

            <a
              href="/history"
              role="menuitem"
              className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Alert History
            </a>

            <a
              href="/profiles"
              role="menuitem"
              className="flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Monitoring Profiles
            </a>

            <hr className="my-2 border-slate-700" aria-hidden="true" />
            <p className="px-3 py-2 text-xs text-slate-400">Signing out deletes this browser&apos;s saved frames, history, recordings and settings.</p>

            {isGuest && (
              <div className="px-3 py-2 text-xs text-slate-500">
                <p className="mb-2">Data stored locally in your browser.</p>
                <p>Create an account to sync across devices.</p>
              </div>
            )}

            <button
              onClick={handleLogout}
              role="menuitem"
              className="flex items-center gap-3 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {isGuest ? 'Clear Session' : 'Log Out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuthButton;





























