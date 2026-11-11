/**
 * Backend Settings Component
 *
 * Allows users to configure backend URLs for full-featured mode.
 * When no backend is configured, the app runs in local-only mode
 * with client-side AI (TensorFlow.js + Transformers.js).
 *
 * Includes educational content explaining:
 * - Free GitHub Pages hosting model
 * - How local mode works
 * - What the monitoring server provides
 * - How to deploy your own server
 *
 * @module components/BackendSettings
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useBackendStatus } from '@/contexts/BackendStatusContext';

// =============================================================================
// Types
// =============================================================================

interface BackendSettingsProps {
  /** Called when settings panel should close */
  onClose?: () => void;
  /** Show as modal overlay */
  isModal?: boolean;
  /** Additional CSS classes */
  className?: string;
}

interface TestResult {
  api: 'testing' | 'success' | 'failed' | null;
  ws: 'testing' | 'success' | 'failed' | null;
  ollama: 'testing' | 'success' | 'failed' | null;
}

// =============================================================================
// Constants
// =============================================================================

const BACKEND_FEATURES = [
  {
    id: 'account-sync',
    name: 'Account Sync',
    description: 'Sync settings and alerts across devices',
    requiresBackend: true,
  },
  {
    id: 'semantic-analysis',
    name: 'Advanced AI Analysis',
    description: 'Enhanced vision analysis with Ollama (LLaVA/Moondream)',
    requiresOllama: true,
  },
  {
    id: 'sms-alerts',
    name: 'SMS Alerts',
    description: 'Send emergency SMS via Twilio',
    requiresBackend: true,
    setupHint:
      'Requires an optional SafeOS monitoring server (API) plus SMS provider credentials (e.g. Twilio).\n\nIn local/offline mode there is no server to send remote SMS.',
  },
  {
    id: 'telegram-alerts',
    name: 'Telegram Alerts',
    description: 'Send alerts to Telegram',
    requiresBackend: true,
    setupHint:
      'Requires an optional SafeOS monitoring server (API) plus a Telegram bot token + chat ID.\n\nIn local/offline mode there is no server to deliver Telegram alerts.',
  },
  {
    id: 'multi-device',
    name: 'Multi-Device Monitoring',
    description: 'Monitor streams from multiple devices',
    requiresBackend: true,
  },
  {
    id: 'alert-history',
    name: 'Cloud Alert History',
    description: 'Store alert history in the cloud',
    requiresBackend: true,
  },
];

// =============================================================================
// Helper Components
// =============================================================================

/** Expandable section with chevron toggle */
function ExpandableSection({
  title,
  icon,
  defaultExpanded = false,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-4 py-3 text-left bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
          {icon}
          {title}
        </span>
        <ChevronIcon className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      {isExpanded && (
        <div className="px-4 py-3 bg-slate-800/20 border-t border-slate-700/30">
          {children}
        </div>
      )}
    </div>
  );
}

/** Info icon with tooltip on hover/click */
function TooltipInfo({ content, title }: { content: string; title?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
        aria-label={title || 'More information'}
      >
        <InfoIcon className="w-4 h-4" />
      </button>
      {isOpen && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-800 border border-slate-600 rounded-lg shadow-xl text-xs text-slate-300">
          {title && <p className="font-medium text-white mb-1">{title}</p>}
          <p className="whitespace-pre-wrap">{content}</p>
          <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-1 w-2 h-2 bg-slate-800 border-r border-b border-slate-600 rotate-45" />
        </div>
      )}
    </div>
  );
}

/** Hosting explanation banner */
function HostingBanner({ isLocalOnly }: { isLocalOnly: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${isLocalOnly ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isLocalOnly ? 'bg-blue-500/20' : 'bg-emerald-500/20'}`}>
          <GlobeIcon className={`w-5 h-5 ${isLocalOnly ? 'text-blue-400' : 'text-emerald-400'}`} />
        </div>
        <div className="flex-1">
          <h3 className={`font-semibold text-sm ${isLocalOnly ? 'text-blue-300' : 'text-emerald-300'}`}>
            {isLocalOnly ? 'Offline-First (No Server Required)' : 'Connected to Monitoring Server'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {isLocalOnly ? (
              <>
                This app runs entirely in your browser - <span className="text-white font-medium">no server required!</span>
                {' '}All core monitoring features work offline. Optionally connect to a monitoring server for cloud history, webhooks, and remote alerts.
              </>
            ) : (
              <>
                You&apos;re connected to a monitoring server with full features enabled.
                {' '}Cloud history, webhooks, and remote alert channels can be enabled (some require provider credentials).
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Icon Components
// =============================================================================

function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function GlobeIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function StatusIcon({ status, className = '' }: { status: 'testing' | 'success' | 'failed' | null; className?: string }) {
  if (status === 'testing') {
    return (
      <svg className={`w-4 h-4 text-blue-400 animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    );
  }

  if (status === 'success') {
    return (
      <svg className={`w-4 h-4 text-emerald-400 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }

  if (status === 'failed') {
    return (
      <svg className={`w-4 h-4 text-red-400 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }

  return null;
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function BackendSettings({ onClose, isModal = false, className = '' }: BackendSettingsProps) {
  const { config, updateConfig, retry, status, isConnected, isLocalOnly } = useBackendStatus();

  // Form state
  const [apiUrl, setApiUrl] = useState(config.apiUrl);
  const [wsUrl, setWsUrl] = useState(config.wsUrl);
  const [ollamaUrl, setOllamaUrl] = useState(config.ollamaUrl);
  const [hasChanges, setHasChanges] = useState(false);

  // Test results
  const [testResults, setTestResults] = useState<TestResult>({
    api: null,
    ws: null,
    ollama: null,
  });
  const [isTesting, setIsTesting] = useState(false);

  // Sync form with config changes
  useEffect(() => {
    setApiUrl(config.apiUrl);
    setWsUrl(config.wsUrl);
    setOllamaUrl(config.ollamaUrl);
  }, [config]);

  // Track changes
  useEffect(() => {
    const changed =
      apiUrl !== config.apiUrl ||
      wsUrl !== config.wsUrl ||
      ollamaUrl !== config.ollamaUrl;
    setHasChanges(changed);
  }, [apiUrl, wsUrl, ollamaUrl, config]);

  // Listen for open event
  useEffect(() => {
    const handleOpenSettings = () => {
      // Settings panel is visible, could focus first input
    };

    window.addEventListener('safeos:open-backend-settings', handleOpenSettings);
    return () => {
      window.removeEventListener('safeos:open-backend-settings', handleOpenSettings);
    };
  }, []);

  // Test individual connection
  const testConnection = useCallback(async (type: 'api' | 'ws' | 'ollama', url: string) => {
    if (!url) return 'failed';

    try {
      if (type === 'api') {
        const response = await fetch(`${url}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        return response.ok ? 'success' : 'failed';
      }

      if (type === 'ws') {
        return new Promise<'success' | 'failed'>((resolve) => {
          const ws = new WebSocket(url);
          const timeout = setTimeout(() => {
            ws.close();
            resolve('failed');
          }, 5000);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
            resolve('success');
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve('failed');
          };
        });
      }

      if (type === 'ollama') {
        const response = await fetch(`${url}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        return response.ok ? 'success' : 'failed';
      }

      return 'failed';
    } catch {
      return 'failed';
    }
  }, []);

  // Test all connections
  const handleTestAll = useCallback(async () => {
    setIsTesting(true);
    setTestResults({
      api: apiUrl ? 'testing' : null,
      ws: wsUrl ? 'testing' : null,
      ollama: ollamaUrl ? 'testing' : null,
    });

    const results: TestResult = {
      api: null,
      ws: null,
      ollama: null,
    };

    // Test in parallel
    const [apiResult, wsResult, ollamaResult] = await Promise.all([
      apiUrl ? testConnection('api', apiUrl) : Promise.resolve(null),
      wsUrl ? testConnection('ws', wsUrl) : Promise.resolve(null),
      ollamaUrl ? testConnection('ollama', ollamaUrl) : Promise.resolve(null),
    ]);

    results.api = apiResult as TestResult['api'];
    results.ws = wsResult as TestResult['ws'];
    results.ollama = ollamaResult as TestResult['ollama'];

    setTestResults(results);
    setIsTesting(false);
  }, [apiUrl, wsUrl, ollamaUrl, testConnection]);

  // Save configuration
  const handleSave = useCallback(async () => {
    await updateConfig({
      apiUrl: apiUrl.trim(),
      wsUrl: wsUrl.trim(),
      ollamaUrl: ollamaUrl.trim(),
      configured: !!(apiUrl.trim() || wsUrl.trim()),
    });

    // Retry connection with new settings
    setTimeout(() => retry(), 100);
    setHasChanges(false);
  }, [apiUrl, wsUrl, ollamaUrl, updateConfig, retry]);

  // Clear configuration
  const handleClear = useCallback(async () => {
    setApiUrl('');
    setWsUrl('');
    setOllamaUrl('');
    await updateConfig({
      apiUrl: '',
      wsUrl: '',
      ollamaUrl: '',
      configured: false,
    });
    setTestResults({ api: null, ws: null, ollama: null });
  }, [updateConfig]);

  // Auto-fill WebSocket URL based on API URL
  const handleApiUrlChange = (value: string) => {
    setApiUrl(value);

    // Auto-suggest WebSocket URL
    if (value && !wsUrl) {
      const suggestedWs = value.replace(/^http/, 'ws');
      setWsUrl(suggestedWs);
    }
  };

  const content = (
    <div className={`bg-slate-900 rounded-2xl border border-slate-700/50 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Monitoring Server Configuration</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Optional - The app works fully offline without a monitoring server
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Hosting Banner */}
      <div className="px-6 py-4">
        <HostingBanner isLocalOnly={isLocalOnly} />
      </div>

      {/* Current Status */}
      <div className="px-6 pb-4">
        <div className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected
                ? 'bg-emerald-400'
                : isLocalOnly
                ? 'bg-amber-400'
                : 'bg-red-400'
            }`}
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-white">
              {isConnected
                ? 'Connected to Monitoring Server'
                : isLocalOnly
                ? 'Running in Local Mode'
                : 'Disconnected'}
            </p>
            <p className="text-xs text-slate-400">
              {isConnected
                ? 'All features available'
                : isLocalOnly
                ? 'All core features work offline - cloud features unavailable'
                : status.error || 'Check your configuration'}
            </p>
          </div>
        </div>
      </div>

      {/* Educational Sections */}
      <div className="px-6 pb-4 space-y-2">
        <ExpandableSection
          title="How does local mode work?"
          icon={<span className="text-blue-400">?</span>}
          defaultExpanded={isLocalOnly}
        >
          <div className="text-xs text-slate-400 space-y-2">
            <p className="text-slate-300 font-medium mb-2">
              SafeOS Guardian uses advanced browser technologies:
            </p>
            <ul className="space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 shrink-0">Camera</span>
                <span>Uses your device&apos;s camera via MediaDevices API</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 shrink-0">AI</span>
                <span>TensorFlow.js runs neural networks directly in your browser</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 shrink-0">Audio</span>
                <span>Web Audio API analyzes sound patterns (crying, barking)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 shrink-0">Storage</span>
                <span>IndexedDB stores your data locally on device</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-400 shrink-0">Alerts</span>
                <span>Web Push sends notifications even when app is closed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 shrink-0">Offline</span>
                <span>Service Worker enables full offline functionality</span>
              </li>
            </ul>
            <p className="pt-2 text-emerald-400 font-medium">
              Your data never leaves your device unless you configure a server.
            </p>
          </div>
        </ExpandableSection>

        <ExpandableSection
          title="What does the monitoring server provide?"
          icon={<span className="text-emerald-400">+</span>}
        >
          <div className="text-xs text-slate-400 space-y-2">
            <p className="text-slate-300 font-medium mb-2">
              When connected to a SafeOS monitoring server, you get additional features:
            </p>
            <ul className="space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 shrink-0">Cloud Sync</span>
                <span>Access your data from any device</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 shrink-0">SMS Alerts</span>
                <span>Receive text messages via Twilio</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-300 shrink-0">Telegram</span>
                <span>Get instant alerts in Telegram</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 shrink-0">Advanced AI</span>
                <span>Server-side LLaVA/Moondream vision analysis</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 shrink-0">Multi-device</span>
                <span>Monitor cameras across multiple devices</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-pink-400 shrink-0">History</span>
                <span>Store unlimited alert history in the cloud</span>
              </li>
            </ul>
            <div className="pt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300">
              <strong>Note:</strong> The public server is sometimes offline for maintenance or cost savings.
              When unavailable, the app automatically switches to local mode.
            </div>
          </div>
        </ExpandableSection>

        <ExpandableSection
          title="Deploy your own server"
          icon={<span className="text-orange-400">*</span>}
        >
          <div className="text-xs text-slate-400 space-y-2">
            <p className="text-slate-300 font-medium mb-2">
              Want 24/7 server access? Deploy your own on Linode:
            </p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Create a Linode 8GB instance (~$48/month)</li>
              <li>Follow the deployment guide in the SafeOS repository to install and start the server with Docker Compose</li>
              <li>Point your domain to the Linode IP</li>
              <li>Enter your server URL in the field above</li>
            </ol>
            <div className="pt-2 flex gap-2">
              <a
                href="https://www.linode.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors"
              >
                Linode Signup
              </a>
              <a
                href="https://github.com/framerslab/safeos/blob/master/docs/DEPLOYMENT.md"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors"
              >
                Documentation
              </a>
            </div>
          </div>
        </ExpandableSection>
      </div>

      {/* Configuration Form */}
      <div className="px-6 py-4 border-t border-slate-700/50 space-y-4">
        <h3 className="text-sm font-medium text-slate-300">Server Configuration</h3>

        {/* API URL */}
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <label className="text-sm font-medium text-slate-300">
              API URL
            </label>
            <TooltipInfo
              title="API Server"
              content="The SafeOS API server handles authentication, cloud sync, and sends SMS/Telegram alerts.

Example: https://safeos-api.yourdomain.com

Leave empty to use local-only mode."
            />
          </div>
          <div className="relative">
            <input
              type="url"
              value={apiUrl}
              onChange={(e) => handleApiUrlChange(e.target.value)}
              placeholder="https://safeos-api.yourdomain.com"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
            />
            {testResults.api && (
              <StatusIcon status={testResults.api} className="absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>

        {/* WebSocket URL */}
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <label className="text-sm font-medium text-slate-300">
              WebSocket URL
            </label>
            <TooltipInfo
              title="WebSocket Server"
              content="Real-time updates and multi-device sync use WebSocket connections.

Usually the same as API URL but with wss:// prefix.
Auto-filled when you enter API URL.

Example: wss://safeos-api.yourdomain.com"
            />
          </div>
          <div className="relative">
            <input
              type="url"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="wss://safeos-api.yourdomain.com"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
            />
            {testResults.ws && (
              <StatusIcon status={testResults.ws} className="absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>

        {/* Ollama URL (Optional) */}
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <label className="text-sm font-medium text-slate-300">
              Ollama URL <span className="text-slate-500">(Optional)</span>
            </label>
            <TooltipInfo
              title="Ollama Local AI"
              content="Ollama runs advanced AI models locally on your machine or server.

Enables enhanced scene analysis using models like LLaVA or Moondream.

Example: http://localhost:11434 (local)
Example: http://ollama:11434 (Docker)

Not required - browser AI works without this."
            />
          </div>
          <div className="relative">
            <input
              type="url"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
            />
            {testResults.ollama && (
              <StatusIcon status={testResults.ollama} className="absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleTestAll}
            disabled={isTesting || (!apiUrl && !wsUrl && !ollamaUrl)}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Changes
          </button>
          {config.configured && (
            <button
              onClick={handleClear}
              className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Features */}
      <div className="px-6 py-4 border-t border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Feature Availability</h3>
        <div className="space-y-2">
          {BACKEND_FEATURES.map((feature) => {
            const isAvailable = feature.requiresOllama
              ? status.ollama === 'connected'
              : feature.requiresBackend
              ? isConnected
              : true;

            return (
              <div
                key={feature.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  isAvailable ? 'bg-emerald-500/5' : 'bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isAvailable ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-1">
                      <p className={`text-sm ${isAvailable ? 'text-white' : 'text-slate-400'}`}>
                        {feature.name}
                      </p>
                      {feature.setupHint && (
                        <TooltipInfo
                          title={`${feature.name} setup`}
                          content={feature.setupHint}
                        />
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{feature.description}</p>
                  </div>
                </div>
                {!isAvailable && (
                  <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
                    {feature.requiresOllama ? 'Needs Ollama' : 'Needs Monitoring Server'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Local-Only Features Info */}
      <div className="px-6 py-4 border-t border-slate-700/50 bg-slate-800/30">
        <h3 className="text-sm font-medium text-emerald-400 mb-2">Always Available (No Monitoring Server Required)</h3>
        <ul className="grid grid-cols-2 gap-1.5 text-xs text-slate-400">
          <li className="flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
            Camera streaming
          </li>
          <li className="flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
            Motion detection
          </li>
          <li className="flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
            Audio detection
          </li>
          <li className="flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
            Person/animal detection
          </li>
          <li className="flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
            Browser AI analysis
          </li>
          <li className="flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
            Browser notifications (this device)
          </li>
          <li className="flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
            Local alert history
          </li>
          <li className="flex items-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
            Offline support (PWA)
          </li>
        </ul>
      </div>
    </div>
  );

  // Render as modal or inline
  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto">{content}</div>
      </div>
    );
  }

  return content;
}

// =============================================================================
// Exports
// =============================================================================

export default BackendSettings;
