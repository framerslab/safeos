/**
 * AI Models Settings Page
 *
 * Configure AI processing modes, view model status, and manage
 * both local Ollama models and browser-based COCO-SSD detection.
 *
 * @module app/settings/models/page
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSettingsStore, type ProcessingMode, getProcessingModeInfo } from '../../../stores/settings-store';
import { ModelDownloadProgress, ModelStatusBadge } from '../../../components/ModelDownloadProgress';
import { BackButton } from '@/components/BackButton';

// =============================================================================
// Types
// =============================================================================

interface OllamaStatus {
    connected: boolean;
    models: string[];
    error?: string;
    lastChecked: Date | null;
}

// =============================================================================
// AI Models Page
// =============================================================================

export default function AIModelsPage() {
    const [mounted, setMounted] = useState(false);
    const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({
        connected: false,
        models: [],
        lastChecked: null,
    });
    const [isCheckingOllama, setIsCheckingOllama] = useState(false);

    const { globalSettings, updateGlobalSettings } = useSettingsStore();
    const currentMode = globalSettings.processingMode;

    const setProcessingMode = (mode: ProcessingMode) => {
        updateGlobalSettings({ processingMode: mode });
    };

    useEffect(() => {
        setMounted(true);
        checkOllamaStatus();
    }, []);

    const checkOllamaStatus = async () => {
        setIsCheckingOllama(true);
        try {
            const host = process.env.NEXT_PUBLIC_OLLAMA_HOST || 'http://localhost:11434';
            const response = await fetch(`${host}/api/tags`, {
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const data = await response.json();
                setOllamaStatus({
                    connected: true,
                    models: data.models?.map((m: { name: string }) => m.name) || [],
                    lastChecked: new Date(),
                });
            } else {
                setOllamaStatus({
                    connected: false,
                    models: [],
                    error: 'Ollama not responding',
                    lastChecked: new Date(),
                });
            }
        } catch (error) {
            setOllamaStatus({
                connected: false,
                models: [],
                error: error instanceof Error ? error.message : 'Connection failed',
                lastChecked: new Date(),
            });
        } finally {
            setIsCheckingOllama(false);
        }
    };

    if (!mounted) {
        return <LoadingState />;
    }

    const modeInfo = getProcessingModeInfo(currentMode);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Header */}
            <header className="p-4 sm:p-6 border-b border-slate-700/50">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <BackButton
                          fallbackHref="/settings"
                          ariaLabel="Back to settings"
                          className="bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white"
                        />
                        <div>
                            <h1 className="text-xl font-bold text-white">AI Models</h1>
                            <p className="text-sm text-slate-400">Configure local and cloud AI processing</p>
                        </div>
                    </div>
                    <ModelStatusBadge />
                </div>
            </header>

            {/* Main Content */}
            <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

                {/* Processing Mode Selection */}
                <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Processing Mode</h2>
                    <p className="text-sm text-slate-400 mb-6">
                        Choose how your video feed is analyzed. Local processing keeps everything on your device.
                    </p>

                    <div className="space-y-3">
                        {(['local', 'ai_enhanced', 'hybrid'] as ProcessingMode[]).map((mode) => {
                            const info = getProcessingModeInfo(mode);
                            return (
                                <button
                                    key={mode}
                                    onClick={() => setProcessingMode(mode)}
                                    className={`w-full flex items-start gap-4 p-4 rounded-lg border transition-all ${currentMode === mode
                                        ? 'border-emerald-500/50 bg-emerald-500/10'
                                        : 'border-slate-700 hover:border-slate-600 bg-slate-900/50'
                                        }`}
                                >
                                    <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center ${currentMode === mode
                                        ? 'border-emerald-500'
                                        : 'border-slate-600'
                                        }`}>
                                        {currentMode === mode && (
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        )}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium text-white">{info.label}</span>
                                            {info.isInstant && (
                                                <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded">
                                                    Instant
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-400">{info.description}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Current Mode Info */}
                <section className={`rounded-xl border p-4 ${modeInfo.color === 'green' ? 'bg-emerald-500/5 border-emerald-500/20' :
                    modeInfo.color === 'amber' ? 'bg-amber-500/5 border-amber-500/20' :
                        'bg-blue-500/5 border-blue-500/20'
                    }`}>
                    <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${modeInfo.color === 'green' ? 'bg-emerald-500/20' :
                            modeInfo.color === 'amber' ? 'bg-amber-500/20' :
                                'bg-blue-500/20'
                            }`}>
                            <AIIcon className={`w-4 h-4 ${modeInfo.color === 'green' ? 'text-emerald-400' :
                                modeInfo.color === 'amber' ? 'text-amber-400' :
                                    'text-blue-400'
                                }`} />
                        </div>
                        <div>
                            <h3 className={`font-medium ${modeInfo.color === 'green' ? 'text-emerald-300' :
                                modeInfo.color === 'amber' ? 'text-amber-300' :
                                    'text-blue-300'
                                }`}>
                                Current: {modeInfo.label}
                            </h3>
                            <p className="text-sm text-slate-400 mt-1">
                                {modeInfo.isInstant
                                    ? 'All analysis happens on your device with instant response times.'
                                    : 'Analysis may be queued for AI processing with potential delays.'}
                            </p>
                        </div>
                    </div>
                </section>

                {/* Ollama Server Status */}
                <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Ollama Server</h2>
                        <button
                            onClick={checkOllamaStatus}
                            disabled={isCheckingOllama}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <RefreshIcon className={isCheckingOllama ? 'animate-spin' : ''} />
                            {isCheckingOllama ? 'Checking...' : 'Refresh'}
                        </button>
                    </div>

                    <div className={`p-4 rounded-lg border ${ollamaStatus.connected
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-red-500/5 border-red-500/20'
                        }`}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-3 h-3 rounded-full ${ollamaStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                                }`} />
                            <span className={ollamaStatus.connected ? 'text-emerald-300' : 'text-red-300'}>
                                {ollamaStatus.connected ? 'Connected' : 'Not Connected'}
                            </span>
                        </div>

                        {ollamaStatus.connected && ollamaStatus.models.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-sm font-medium text-slate-300 mb-2">Available Models</h4>
                                <div className="flex flex-wrap gap-2">
                                    {ollamaStatus.models.map((model) => (
                                        <span
                                            key={model}
                                            className="px-2 py-1 text-xs font-mono bg-slate-700/50 text-slate-300 rounded"
                                        >
                                            {model}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!ollamaStatus.connected && (
                            <div className="mt-3 text-sm text-slate-400">
                                <p className="mb-2">To enable Ollama:</p>
                                <ol className="list-decimal list-inside space-y-1 text-slate-500">
                                    <li>Install Ollama: <code className="px-1 py-0.5 bg-slate-700 rounded text-xs">brew install ollama</code></li>
                                    <li>Start server: <code className="px-1 py-0.5 bg-slate-700 rounded text-xs">ollama serve</code></li>
                                    <li>Pull models: <code className="px-1 py-0.5 bg-slate-700 rounded text-xs">ollama pull moondream</code></li>
                                </ol>
                            </div>
                        )}

                        {ollamaStatus.lastChecked && (
                            <p className="mt-3 text-xs text-slate-500">
                                Last checked: {ollamaStatus.lastChecked.toLocaleTimeString()}
                            </p>
                        )}
                    </div>
                </section>

                {/* Browser AI Model */}
                <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Browser AI Model</h2>
                    <p className="text-sm text-slate-400 mb-4">
                        Download the shared person and animal detection model used by Security and Wildlife.
                        Once saved, it can load offline while browser storage is retained.
                    </p>
                    <ModelDownloadProgress />
                </section>

                {/* Recommended Models */}
                <section className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Recommended Ollama Models</h2>
                    <div className="space-y-3">
                        <ModelRecommendation
                            name="moondream"
                            size="~1.7 GB"
                            description="Fast triage model (~500ms). Good for quick scene assessment."
                            installed={ollamaStatus.models.includes('moondream')}
                        />
                        <ModelRecommendation
                            name="llava:7b"
                            size="~4 GB"
                            description="Detailed analysis model. Used when concerns are detected."
                            installed={ollamaStatus.models.some(m => m.startsWith('llava'))}
                        />
                        <ModelRecommendation
                            name="llava:13b"
                            size="~8 GB"
                            description="Premium analysis. Higher accuracy but slower."
                            installed={ollamaStatus.models.includes('llava:13b')}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}

// =============================================================================
// Sub-components
// =============================================================================

function LoadingState() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        </div>
    );
}

function ModelRecommendation({
    name,
    size,
    description,
    installed,
}: {
    name: string;
    size: string;
    description: string;
    installed: boolean;
}) {
    return (
        <div className="flex items-start gap-4 p-4 bg-slate-900/50 rounded-lg">
            <div className={`mt-0.5 w-10 h-10 rounded-lg flex items-center justify-center ${installed ? 'bg-emerald-500/20' : 'bg-slate-700/50'
                }`}>
                {installed ? (
                    <CheckIcon className="w-5 h-5 text-emerald-400" />
                ) : (
                    <DownloadIcon className="w-5 h-5 text-slate-400" />
                )}
            </div>
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-medium text-white">{name}</span>
                    <span className="text-xs text-slate-500">{size}</span>
                    {installed && (
                        <span className="px-1.5 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded">
                            Installed
                        </span>
                    )}
                </div>
                <p className="text-sm text-slate-400">{description}</p>
                {!installed && (
                    <p className="mt-2 text-xs text-slate-500">
                        Install: <code className="px-1 py-0.5 bg-slate-700 rounded">ollama pull {name}</code>
                    </p>
                )}
            </div>
        </div>
    );
}

// (No icons below — shared BackButton handles navigation)

function AIIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
    );
}

function RefreshIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={`w-4 h-4 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
    );
}

function CheckIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
    );
}

function DownloadIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
    );
}
