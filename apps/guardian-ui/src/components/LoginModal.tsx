/**
 * Login Modal Component
 *
 * Modal for login, signup, and guest mode.
 *
 * @module components/LoginModal
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useAuthStore } from '../stores/auth-store';

// =============================================================================
// Types
// =============================================================================

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalView = 'main' | 'guest' | 'returning';

// =============================================================================
// Component
// =============================================================================

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [view, setView] = useState<ModalView>('main');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login, startGuestSession } = useAuthStore();

  // Generate device ID for session persistence
  const getDeviceId = useCallback(() => {
    let deviceId = localStorage.getItem('safeos_device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('safeos_device_id', deviceId);
    }
    return deviceId;
  }, []);

  const handleGuestContinue = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const deviceId = getDeviceId();
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, displayName: displayName || undefined }),
      });

      const data = await response.json();

      if (data.success) {
        // Save token
        localStorage.setItem('safeos_session_token', data.data.token);

        // Update store
        startGuestSession({
          id: data.data.profile.id,
          displayName: data.data.profile.displayName,
          preferences: data.data.profile.preferences,
        });

        onClose();
      } else {
        setError(data.error || 'Failed to create session');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReturningUser = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('safeos_session_token');

      if (!token) {
        setView('guest');
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/auth/session', {
        headers: { 'X-Session-Token': token },
      });

      const data = await response.json();

      if (data.success) {
        login({
          id: data.data.profile.id,
          displayName: data.data.profile.displayName,
          preferences: data.data.profile.preferences,
        });
        onClose();
      } else {
        // Session expired, create new guest session
        setView('guest');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle escape key to close modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <div className="w-full max-w-md mx-4 bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-700/50 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 id="login-modal-title" className="text-2xl font-bold text-white">Welcome to SafeOS</h2>
          <p className="text-sm text-slate-400 mt-1">Free AI monitoring for pets, babies & elderly</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {view === 'main' && (
            <div className="space-y-4">
              <p className="text-center text-slate-300 mb-6">
                Choose how you want to continue:
              </p>

              {/* Guest Mode */}
              <button
                onClick={() => setView('guest')}
                className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl border border-slate-600 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-white font-medium">Continue as Guest</h3>
                  <p className="text-sm text-slate-400">No account needed. Data stored locally.</p>
                </div>
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Returning User */}
              <button
                onClick={handleReturningUser}
                disabled={isLoading}
                className="w-full flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl border border-slate-600 transition-colors disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-white font-medium">Returning User</h3>
                  <p className="text-sm text-slate-400">Continue your previous session.</p>
                </div>
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-slate-500 border-t-white rounded-full animate-spin" aria-label="Loading" />
                ) : (
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>

              <p className="text-center text-xs text-slate-500 mt-6">
                All data is stored locally in your browser for privacy.
                <br />
                No account or email required.
              </p>
            </div>
          )}

          {view === 'guest' && (
            <div className="space-y-4">
              <button
                onClick={() => setView('main')}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                aria-label="Go back to main menu"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>

              <div>
                <label htmlFor="display-name-input" className="block text-sm font-medium text-slate-300 mb-2">
                  Display Name (optional)
                </label>
                <input
                  id="display-name-input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter a name..."
                  aria-describedby="display-name-hint"
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <p id="display-name-hint" className="text-xs text-slate-500 mt-1">
                  This will be shown in your profile.
                </p>
              </div>

              {error && (
                <div role="alert" className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleGuestContinue}
                disabled={isLoading}
                aria-busy={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    Creating session...
                  </span>
                ) : (
                  'Continue as Guest'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900/50 border-t border-slate-700/50">
          <p className="text-xs text-center text-slate-500">
            By continuing, you agree to our{' '}
            <a href="/terms" className="text-emerald-400 hover:underline">Terms</a> and{' '}
            <a href="/privacy" className="text-emerald-400 hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginModal;





























