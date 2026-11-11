/**
 * Backend Status Context
 *
 * Provides real-time backend connection status and feature availability.
 * Enables graceful degradation when backend is unavailable.
 *
 * @module contexts/BackendStatusContext
 */

'use client';

import { getServerModelStatus } from '@/lib/server-model-status';
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface BackendConfig {
  apiUrl: string;
  wsUrl: string;
  ollamaUrl: string;
  configured: boolean;
}

export interface BackendStatus {
  /** API server connection status */
  api: ConnectionStatus;
  /** WebSocket connection status */
  websocket: ConnectionStatus;
  /** Ollama AI service status */
  ollama: ConnectionStatus;
  /** Overall mode: full (all features) or local-only */
  mode: 'full' | 'local-only';
  /** List of features that are disabled due to backend unavailability */
  disabledFeatures: string[];
  /** Last successful connection timestamp */
  lastConnected: Date | null;
  /** Current error message if any */
  error: string | null;
}

export interface BackendStatusContextValue {
  /** Current backend status */
  status: BackendStatus;
  /** Backend configuration */
  config: BackendConfig;
  /** Update backend configuration */
  updateConfig: (config: Partial<BackendConfig>) => void;
  /** Test connection to backend */
  testConnection: () => Promise<boolean>;
  /** Retry connection */
  retry: () => void;
  /** Check if a specific feature is available */
  isFeatureAvailable: (feature: string) => boolean;
  /** Whether we're in local-only mode */
  isLocalOnly: boolean;
  /** Whether backend is fully connected */
  isConnected: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: BackendConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || '',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || '',
  ollamaUrl: process.env.NEXT_PUBLIC_OLLAMA_URL || '',
  configured: false,
};

const STORAGE_KEY = 'safeos_backend_config';
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 5000; // 5 seconds

/** Features that require backend connection */
const BACKEND_REQUIRED_FEATURES = [
  'semantic-analysis',      // Ollama vision analysis
  'account-sync',           // Multi-device sync
  'sms-alerts',            // Twilio SMS
  'telegram-alerts',       // Telegram notifications
  'email-digest',          // Email summaries
  'cloud-history',         // Server-side alert history
  'multi-device',          // Multiple device support
];

/** Features that work without backend (local-only) */
const LOCAL_FEATURES = [
  'camera-streaming',
  'motion-detection',
  'audio-detection',
  'person-detection',
  'animal-detection',
  'local-alerts',
  'web-push',
  'browser-vision',        // Transformers.js
  'local-history',         // IndexedDB
];

// =============================================================================
// Context
// =============================================================================

const BackendStatusContext = createContext<BackendStatusContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export function BackendStatusProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<BackendConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<BackendStatus>({
    api: 'disconnected',
    websocket: 'disconnected',
    ollama: 'disconnected',
    mode: 'local-only',
    disabledFeatures: BACKEND_REQUIRED_FEATURES,
    lastConnected: null,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const healthCheckRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  // Load config from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as BackendConfig;
        setConfig(parsed);
      } catch (error) {
        console.error('[BackendStatus] Failed to parse stored config:', error);
      }
    }
  }, []);

  // Check API health
  const checkApiHealth = useCallback(async (): Promise<boolean> => {
    if (!config.apiUrl) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

      const response = await fetch(`${config.apiUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch (error) {
      return false;
    }
  }, [config.apiUrl]);

  // The model service may be reachable only from the SafeOS server.
  const checkOllamaHealth = useCallback(async (): Promise<boolean> => {
    try {
      return (await getServerModelStatus(config.apiUrl)).available;
    } catch {
      return false;
    }
  }, [config.apiUrl]);

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    if (!config.wsUrl) return;

    // Already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Close existing connection before creating new one
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus(prev => ({ ...prev, websocket: 'connecting' }));

    try {
      const ws = new WebSocket(config.wsUrl);

      ws.onopen = () => {
        setStatus(prev => ({
          ...prev,
          websocket: 'connected',
          lastConnected: new Date(),
        }));
        retryCountRef.current = 0;
      };

      ws.onclose = () => {
        setStatus(prev => ({ ...prev, websocket: 'disconnected' }));
        wsRef.current = null;
      };

      ws.onerror = () => {
        setStatus(prev => ({ ...prev, websocket: 'error' }));
      };

      wsRef.current = ws;
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        websocket: 'error',
        error: 'Failed to connect WebSocket',
      }));
    }
  }, [config.wsUrl]);

  // Full health check
  const performHealthCheck = useCallback(async () => {
    // Skip if not configured
    if (!config.configured && !config.apiUrl) {
      setStatus(prev => ({
        ...prev,
        mode: 'local-only',
        disabledFeatures: BACKEND_REQUIRED_FEATURES,
      }));
      return;
    }

    setStatus(prev => ({ ...prev, api: 'connecting' }));

    const [apiOk, ollamaOk] = await Promise.all([
      checkApiHealth(),
      checkOllamaHealth(),
    ]);

    const disabledFeatures: string[] = [];

    if (!apiOk) {
      disabledFeatures.push('account-sync', 'sms-alerts', 'telegram-alerts', 'email-digest', 'cloud-history', 'multi-device');
    }

    if (!ollamaOk) {
      disabledFeatures.push('semantic-analysis');
    }

    const isFullyConnected = apiOk && ollamaOk;

    setStatus(prev => ({
      ...prev,
      api: apiOk ? 'connected' : 'disconnected',
      ollama: ollamaOk ? 'connected' : 'disconnected',
      mode: isFullyConnected ? 'full' : 'local-only',
      disabledFeatures,
      lastConnected: isFullyConnected ? new Date() : prev.lastConnected,
      error: !apiOk && config.apiUrl ? 'Cannot connect to monitoring server' : null,
    }));

    // Connect WebSocket if API is available
    if (apiOk && config.wsUrl) {
      connectWebSocket();
    }
  }, [config, checkApiHealth, checkOllamaHealth, connectWebSocket]);

  // Start health check interval
  useEffect(() => {
    performHealthCheck();

    healthCheckRef.current = setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL);

    return () => {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [performHealthCheck]);

  // Update config
  const updateConfig = useCallback((updates: Partial<BackendConfig>) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...updates, configured: true };

      // Save to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      }

      return newConfig;
    });

    // Trigger health check with new config
    setTimeout(performHealthCheck, 100);
  }, [performHealthCheck]);

  // Test connection
  const testConnection = useCallback(async (): Promise<boolean> => {
    await performHealthCheck();
    return status.api === 'connected';
  }, [performHealthCheck, status.api]);

  // Retry connection
  const retry = useCallback(() => {
    retryCountRef.current += 1;
    performHealthCheck();
  }, [performHealthCheck]);

  // Check if feature is available
  const isFeatureAvailable = useCallback((feature: string): boolean => {
    // Local features are always available
    if (LOCAL_FEATURES.includes(feature)) return true;

    // Backend features depend on connection
    return !status.disabledFeatures.includes(feature);
  }, [status.disabledFeatures]);

  const value: BackendStatusContextValue = {
    status,
    config,
    updateConfig,
    testConnection,
    retry,
    isFeatureAvailable,
    isLocalOnly: status.mode === 'local-only',
    isConnected: status.api === 'connected',
  };

  return (
    <BackendStatusContext.Provider value={value}>
      {children}
    </BackendStatusContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access backend status and configuration
 *
 * @example
 * const { status, isLocalOnly, isFeatureAvailable } = useBackendStatus();
 * if (isLocalOnly) {
 *   // Show local-only mode banner
 * }
 * if (!isFeatureAvailable('semantic-analysis')) {
 *   // Show "feature unavailable" message
 * }
 */
export function useBackendStatus(): BackendStatusContextValue {
  const context = useContext(BackendStatusContext);

  if (!context) {
    throw new Error('useBackendStatus must be used within a BackendStatusProvider');
  }

  return context;
}

export default BackendStatusProvider;
