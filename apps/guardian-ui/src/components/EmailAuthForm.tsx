/**
 * Email Authentication Form Component
 *
 * Full email/password authentication with login, signup, and password reset.
 *
 * @module components/EmailAuthForm
 */

'use client';

import React, { useState } from 'react';
import { showToast } from './Toast';
import { getApiUrl } from '@/lib/env';

// =============================================================================
// Types
// =============================================================================

type AuthMode = 'login' | 'signup' | 'forgot-password';

interface EmailAuthFormProps {
  onSuccess: (data: { sessionToken: string; user: any }) => void;
  onCancel?: () => void;
  initialMode?: AuthMode;
}

// =============================================================================
// Component
// =============================================================================

export function EmailAuthForm({ onSuccess, onCancel, initialMode = 'login' }: EmailAuthFormProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const resetForm = () => {
    setError(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      if (!apiUrl) {
        setError('Email login/signup requires a monitoring server (API). SafeOS can still run fully local/offline without an account.');
        setLoading(false);
        return;
      }

      if (mode === 'signup') {
        // Validate password match
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        const response = await fetch(`${apiUrl}/api/auth/email/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, displayName }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || 'Registration failed');
          return;
        }

        showToast({
          title: 'Account created!',
          message: 'Please check your email to verify.',
          type: 'success',
        });
        setMode('login');
        resetForm();

      } else if (mode === 'login') {
        const response = await fetch(`${apiUrl}/api/auth/email/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || 'Login failed');
          return;
        }

        onSuccess({
          sessionToken: data.sessionToken,
          user: data.user,
        });

      } else if (mode === 'forgot-password') {
        const response = await fetch(`${apiUrl}/api/auth/email/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.message || 'Failed to send reset email');
          return;
        }

        showToast({
          title: 'Password Reset',
          message: 'If an account exists, a reset link has been sent.',
          type: 'success',
        });
        setMode('login');
        resetForm();
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Mode Title */}
        <h2 className="text-2xl font-bold text-white text-center">
          {mode === 'login' && 'Log In'}
          {mode === 'signup' && 'Create Account'}
          {mode === 'forgot-password' && 'Reset Password'}
        </h2>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg px-4 py-3 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Display Name (signup only) */}
        {mode === 'signup' && (
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-slate-300 mb-1">
              Display Name
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg 
                text-white placeholder-slate-500 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        )}

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg 
              text-white placeholder-slate-500 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {/* Password (not for forgot-password) */}
        {mode !== 'forgot-password' && (
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg 
                text-white placeholder-slate-500 focus:ring-emerald-500 focus:border-emerald-500"
            />
            {mode === 'signup' && (
              <p className="mt-1 text-xs text-slate-500">
                At least 8 characters with uppercase, lowercase, and a number
              </p>
            )}
          </div>
        )}

        {/* Confirm Password (signup only) */}
        {mode === 'signup' && (
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg 
                text-white placeholder-slate-500 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        )}

        {/* Forgot Password Link (login only) */}
        {mode === 'login' && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => {
                setMode('forgot-password');
                resetForm();
              }}
              className="text-sm text-emerald-400 hover:text-emerald-300"
            >
              Forgot your password?
            </button>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-white 
            py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity 
            disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            <>
              {mode === 'login' && 'Log In'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'forgot-password' && 'Send Reset Link'}
            </>
          )}
        </button>

        {/* Mode Switch */}
        <div className="text-center text-sm text-slate-400">
          {mode === 'login' && (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  resetForm();
                }}
                className="text-emerald-400 hover:text-emerald-300"
              >
                Sign up
              </button>
            </>
          )}
          {mode === 'signup' && (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  resetForm();
                }}
                className="text-emerald-400 hover:text-emerald-300"
              >
                Log in
              </button>
            </>
          )}
          {mode === 'forgot-password' && (
            <>
              Remember your password?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  resetForm();
                }}
                className="text-emerald-400 hover:text-emerald-300"
              >
                Log in
              </button>
            </>
          )}
        </div>

        {/* Cancel Button */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 text-slate-400 hover:text-slate-300 text-sm"
          >
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}

export default EmailAuthForm;

