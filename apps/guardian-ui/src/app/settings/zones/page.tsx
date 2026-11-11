/**
 * Detection Zones Settings Page
 *
 * Configure detection zones for monitoring.
 *
 * @module app/settings/zones/page
 */

'use client';

import React, { useState, useEffect } from 'react';
import { DetectionZoneEditor } from '../../../components/DetectionZoneEditor';
import { useSettingsStore } from '../../../stores/settings-store';
import { BackButton } from '@/components/BackButton';

// =============================================================================
// Detection Zones Page
// =============================================================================

export default function DetectionZonesPage() {
    const [mounted, setMounted] = useState(false);
    const { detectionZones } = useSettingsStore();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
        );
    }

    const activeZones = detectionZones.filter(z => z.enabled).length;

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
                            <h1 className="text-xl font-bold text-white">Detection Zones</h1>
                            <p className="text-sm text-slate-400">
                                Define regions to monitor for motion and activity
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded">
                            {activeZones} active
                        </span>
                        <span className="px-2 py-1 text-xs font-medium bg-slate-700/50 text-slate-400 rounded">
                            {detectionZones.length} total
                        </span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
                {/* Instructions */}
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                    <h3 className="text-sm font-medium text-blue-300 mb-2">How to Use</h3>
                    <ul className="text-sm text-slate-400 space-y-1">
                        <li>• Click <strong className="text-blue-300">&quot;New Zone&quot;</strong> then draw a rectangle on the preview</li>
                        <li>• Click on a zone to select it for editing</li>
                        <li>• Double-click a zone name to rename it</li>
                        <li>• Disabled zones appear with dashed borders</li>
                    </ul>
                </div>

                {/* Zone Editor */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Zone Editor</h2>
                    <DetectionZoneEditor
                        width={640}
                        height={360}
                        showControls={true}
                    />
                </div>

                {/* Zone Info */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">About Detection Zones</h2>
                    <div className="grid sm:grid-cols-2 gap-4 text-sm">
                        <div className="p-4 bg-slate-900/50 rounded-lg">
                            <h3 className="font-medium text-emerald-400 mb-2">Why Use Zones?</h3>
                            <p className="text-slate-400">
                                Focus detection on specific areas like a pet bed, crib, or doorway.
                                Ignore busy areas like windows or TV screens to reduce false alerts.
                            </p>
                        </div>
                        <div className="p-4 bg-slate-900/50 rounded-lg">
                            <h3 className="font-medium text-blue-400 mb-2">Zone Types</h3>
                            <ul className="text-slate-400 space-y-1">
                                <li><span className="text-emerald-400">●</span> Active zones trigger alerts</li>
                                <li><span className="text-slate-500">●</span> Disabled zones are ignored</li>
                                <li>Overlapping zones are all checked</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// (No icons below — shared BackButton handles navigation)
