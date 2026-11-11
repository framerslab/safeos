/**
 * Environment Configuration
 *
 * Centralizes environment detection and configuration.
 * Helps distinguish between local development and static deployments.
 *
 * @module lib/env
 */

'use client';

// =============================================================================
// Static Mode Detection
// =============================================================================

// =============================================================================
// Local Configuration (browser)
// =============================================================================

const BACKEND_CONFIG_STORAGE_KEY = 'safeos_backend_config';

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function getStoredBackendConfig(): {
  apiUrl?: string;
  wsUrl?: string;
  ollamaUrl?: string;
} {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(BACKEND_CONFIG_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as Record<string, unknown>;

    const apiUrl = typeof parsed.apiUrl === 'string' ? normalizeBaseUrl(parsed.apiUrl) : undefined;
    const wsUrl = typeof parsed.wsUrl === 'string' ? normalizeBaseUrl(parsed.wsUrl) : undefined;
    const ollamaUrl = typeof parsed.ollamaUrl === 'string' ? normalizeBaseUrl(parsed.ollamaUrl) : undefined;

    return { apiUrl, wsUrl, ollamaUrl };
  } catch {
    return {};
  }
}

/**
 * Check if the app is running in static mode (GitHub Pages deployment)
 * Static mode disables backend connections and API calls.
 */
export function isStaticMode(): boolean {
  // A server explicitly saved by this visitor overrides static-host defaults.
  if (getStoredBackendConfig().apiUrl) return false;

  // Explicit static mode flag
  if (process.env.NEXT_PUBLIC_STATIC_MODE === 'true') {
    return true;
  }

  // Check if running on GitHub Pages (safeos.sh or *.github.io)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (
      hostname === 'safeos.sh' ||
      hostname.endsWith('.github.io') ||
      hostname.endsWith('.pages.dev') ||
      hostname.endsWith('.netlify.app') ||
      hostname.endsWith('.vercel.app')
    ) {
      return true;
    }
  }

  // Check if API URL is configured (empty = static mode)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (!apiUrl || apiUrl === '') {
    // Only consider static mode if not on localhost
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if backend connection is available
 */
export function hasBackendConnection(): boolean {
  return !isStaticMode();
}

// =============================================================================
// API URLs
// =============================================================================

/**
 * Get the API base URL
 * Returns empty string in static mode to prevent connection attempts
 */
export function getApiUrl(): string {
  if (isStaticMode()) {
    return '';
  }

  const stored = getStoredBackendConfig();
  if (stored.apiUrl) return stored.apiUrl;

  const envUrl = process.env.NEXT_PUBLIC_API_URL || '';
  return normalizeBaseUrl(envUrl);
}

/**
 * Get the WebSocket URL
 * Returns empty string in static mode to prevent connection attempts
 */
export function getWsUrl(): string {
  if (isStaticMode()) {
    return '';
  }

  const stored = getStoredBackendConfig();
  if (stored.wsUrl) return stored.wsUrl;

  const envUrl = process.env.NEXT_PUBLIC_WS_URL || '';
  return normalizeBaseUrl(envUrl);
}

/**
 * Get secondary WebSocket URL (for monitoring)
 * Returns empty string in static mode
 */
export function getWsUrl2(): string {
  if (isStaticMode()) {
    return '';
  }

  const stored = getStoredBackendConfig();
  if (stored.wsUrl) return stored.wsUrl;

  const envUrl = process.env.NEXT_PUBLIC_WS_URL || '';
  return normalizeBaseUrl(envUrl);
}

// =============================================================================
// Feature Flags
// =============================================================================

/**
 * Check if a feature requiring backend is available
 */
export function isBackendFeatureEnabled(): boolean {
  return hasBackendConnection();
}

/**
 * Check if WebSocket features are available
 */
export function isWebSocketEnabled(): boolean {
  return hasBackendConnection();
}

/**
 * Check if real-time sync is enabled
 */
export function isSyncEnabled(): boolean {
  return hasBackendConnection();
}

export default {
  isStaticMode,
  hasBackendConnection,
  getApiUrl,
  getWsUrl,
  getWsUrl2,
  isBackendFeatureEnabled,
  isWebSocketEnabled,
  isSyncEnabled,
};
