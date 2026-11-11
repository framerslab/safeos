/**
 * Detection Zone Editor Component
 *
 * Visual editor for creating and managing detection zones on camera preview.
 * Zones can be drawn, resized, enabled/disabled, and have custom names.
 *
 * @module components/DetectionZoneEditor
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore, type DetectionZone, type ZoneSensitivityOverride } from '../stores/settings-store';

// =============================================================================
// Types
// =============================================================================

interface Point {
    x: number;
    y: number;
}

interface DrawingState {
    isDrawing: boolean;
    startPoint: Point | null;
    currentPoint: Point | null;
}

interface DetectionZoneEditorProps {
    /** Video element to overlay zones on */
    videoRef?: React.RefObject<HTMLVideoElement>;
    /** Width of the editor */
    width?: number;
    /** Height of the editor */
    height?: number;
    /** Show zone controls */
    showControls?: boolean;
    /** Callback when zone is selected */
    onZoneSelect?: (zone: DetectionZone | null) => void;
    /** Additional CSS classes */
    className?: string;
}

// =============================================================================
// Zone Colors
// =============================================================================

const ZONE_COLORS = {
    active: {
        fill: 'rgba(16, 185, 129, 0.2)',
        stroke: 'rgba(16, 185, 129, 0.8)',
        handle: 'rgb(16, 185, 129)',
    },
    inactive: {
        fill: 'rgba(100, 116, 139, 0.15)',
        stroke: 'rgba(100, 116, 139, 0.5)',
        handle: 'rgb(100, 116, 139)',
    },
    selected: {
        fill: 'rgba(59, 130, 246, 0.25)',
        stroke: 'rgba(59, 130, 246, 1)',
        handle: 'rgb(59, 130, 246)',
    },
    drawing: {
        fill: 'rgba(251, 191, 36, 0.2)',
        stroke: 'rgba(251, 191, 36, 0.8)',
        handle: 'rgb(251, 191, 36)',
    },
};

// =============================================================================
// Component
// =============================================================================

export function DetectionZoneEditor({
    videoRef,
    width = 640,
    height = 480,
    showControls = true,
    onZoneSelect,
    className = '',
}: DetectionZoneEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const internalVideoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const { detectionZones, updateDetectionZone, addDetectionZone, removeDetectionZone } = useSettingsStore();

    const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
    const [isDrawMode, setIsDrawMode] = useState(false);
    const [previewEnabled, setPreviewEnabled] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [drawing, setDrawing] = useState<DrawingState>({
        isDrawing: false,
        startPoint: null,
        currentPoint: null,
    });
    const [editingName, setEditingName] = useState<string | null>(null);
    const [newZoneName, setNewZoneName] = useState('');

    // Get canvas coordinates from mouse event
    const getCanvasCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
        };
    }, []);

    // Find zone at point
    const getZoneAtPoint = useCallback((point: Point): DetectionZone | null => {
        for (let i = detectionZones.length - 1; i >= 0; i--) {
            const zone = detectionZones[i];
            if (
                point.x >= zone.x &&
                point.x <= zone.x + zone.width &&
                point.y >= zone.y &&
                point.y <= zone.y + zone.height
            ) {
                return zone;
            }
        }
        return null;
    }, [detectionZones]);

    const stopPreview = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        const v = internalVideoRef.current;
        if (v) {
            v.srcObject = null;
        }
        setPreviewEnabled(false);
    }, []);

    const startPreview = useCallback(async () => {
        if (videoRef) return; // external preview managed by parent
        if (previewEnabled) return;

        setPreviewError(null);
        setPreviewEnabled(true);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment',
                },
                audio: false,
            });

            streamRef.current = stream;
            if (internalVideoRef.current) {
                internalVideoRef.current.srcObject = stream;
                await internalVideoRef.current.play();
            }
        } catch (error) {
            setPreviewError(error instanceof Error ? error.message : 'Failed to start camera preview');
            stopPreview();
        }
    }, [previewEnabled, stopPreview, videoRef]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopPreview();
    }, [stopPreview]);

    // Handle pointer down
    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
        const point = getCanvasCoords(e);

        if (isDrawMode) {
            setDrawing({
                isDrawing: true,
                startPoint: point,
                currentPoint: point,
            });
        } else {
            const zone = getZoneAtPoint(point);
            setSelectedZoneId(zone?.id || null);
            onZoneSelect?.(zone);
        }
    }, [isDrawMode, getCanvasCoords, getZoneAtPoint, onZoneSelect]);

    // Handle pointer move
    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.isDrawing) return;

        const point = getCanvasCoords(e);
        setDrawing((prev) => ({
            ...prev,
            currentPoint: point,
        }));
    }, [drawing.isDrawing, getCanvasCoords]);

    // Handle pointer up/cancel
    const handlePointerUp = useCallback(() => {
        if (!drawing.isDrawing || !drawing.startPoint || !drawing.currentPoint) {
            setDrawing({ isDrawing: false, startPoint: null, currentPoint: null });
            return;
        }

        const { startPoint, currentPoint } = drawing;
        const x = Math.min(startPoint.x, currentPoint.x);
        const y = Math.min(startPoint.y, currentPoint.y);
        const zoneWidth = Math.abs(currentPoint.x - startPoint.x);
        const zoneHeight = Math.abs(currentPoint.y - startPoint.y);

        // Only create zone if it's big enough
        if (zoneWidth > 5 && zoneHeight > 5) {
            addDetectionZone({
                name: `Zone ${detectionZones.length + 1}`,
                enabled: true,
                x,
                y,
                width: zoneWidth,
                height: zoneHeight,
            });
        }

        setDrawing({ isDrawing: false, startPoint: null, currentPoint: null });
        setIsDrawMode(false);
    }, [drawing, addDetectionZone, detectionZones.length]);

    // Draw zones on canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw existing zones
        detectionZones.forEach((zone) => {
            const isSelected = zone.id === selectedZoneId;
            const colors = isSelected ? ZONE_COLORS.selected : zone.enabled ? ZONE_COLORS.active : ZONE_COLORS.inactive;

            const x = (zone.x / 100) * canvas.width;
            const y = (zone.y / 100) * canvas.height;
            const w = (zone.width / 100) * canvas.width;
            const h = (zone.height / 100) * canvas.height;

            // Fill
            ctx.fillStyle = colors.fill;
            ctx.fillRect(x, y, w, h);

            // Stroke
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.setLineDash(zone.enabled ? [] : [5, 5]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            // Label
            ctx.fillStyle = colors.stroke;
            ctx.font = '12px Inter, system-ui, sans-serif';
            ctx.fillText(zone.name, x + 4, y + 16);

            // Corner handles for selected zone
            if (isSelected) {
                const handleSize = 8;
                ctx.fillStyle = colors.handle;

                // Top-left
                ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
                // Top-right
                ctx.fillRect(x + w - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
                // Bottom-left
                ctx.fillRect(x - handleSize / 2, y + h - handleSize / 2, handleSize, handleSize);
                // Bottom-right
                ctx.fillRect(x + w - handleSize / 2, y + h - handleSize / 2, handleSize, handleSize);
            }
        });

        // Draw current drawing
        if (drawing.isDrawing && drawing.startPoint && drawing.currentPoint) {
            const colors = ZONE_COLORS.drawing;
            const x = (Math.min(drawing.startPoint.x, drawing.currentPoint.x) / 100) * canvas.width;
            const y = (Math.min(drawing.startPoint.y, drawing.currentPoint.y) / 100) * canvas.height;
            const w = (Math.abs(drawing.currentPoint.x - drawing.startPoint.x) / 100) * canvas.width;
            const h = (Math.abs(drawing.currentPoint.y - drawing.startPoint.y) / 100) * canvas.height;

            ctx.fillStyle = colors.fill;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
        }
    }, [detectionZones, selectedZoneId, drawing]);

    const selectedZone = detectionZones.find((z) => z.id === selectedZoneId);
    const activeVideoRef = videoRef || internalVideoRef;

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Preview surface (video + overlay) */}
            <div
                className="relative w-full border border-slate-700 rounded-lg overflow-hidden bg-slate-900/80"
                style={{ height }}
            >
                <video
                    ref={activeVideoRef}
                    muted
                    playsInline
                    autoPlay
                    className="absolute inset-0 w-full h-full object-cover"
                />

                {/* Canvas overlay */}
                <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    className={`absolute inset-0 w-full h-full ${isDrawMode ? 'cursor-crosshair' : 'cursor-pointer'}`}
                    style={{ touchAction: 'none' }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onContextMenu={(e) => e.preventDefault()}
                />

                {/* Placeholder/Preview controls when no external video */}
                {!videoRef && !previewEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                        <div className="text-center text-slate-500 max-w-xs">
                            <CameraIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p className="text-sm font-medium text-slate-300">Camera preview (optional)</p>
                            <p className="text-xs mt-1">Video-only. No audio is captured.</p>
                            {previewError && (
                                <p className="text-xs text-red-400 mt-2">
                                    {previewError}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={startPreview}
                                className="mt-3 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                            >
                                Enable Camera Preview
                            </button>
                        </div>
                    </div>
                )}

                {!videoRef && previewEnabled && (
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                        <span className="px-2 py-1 text-[10px] bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                            LIVE PREVIEW
                        </span>
                        <button
                            type="button"
                            onClick={stopPreview}
                            className="px-2 py-1 text-[10px] bg-slate-800/80 text-slate-200 rounded border border-slate-600 hover:bg-slate-700 transition-colors"
                        >
                            Stop
                        </button>
                    </div>
                )}
            </div>

            {/* Controls */}
            {showControls && (
                <div className="mt-4 space-y-4">
                    {/* Toolbar */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsDrawMode(!isDrawMode)}
                            className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] min-w-[44px] rounded-lg text-sm font-medium transition-colors active:scale-95 ${isDrawMode
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600'
                                }`}
                        >
                            <PlusIcon className="w-4 h-4" />
                            {isDrawMode ? 'Drawing...' : 'New Zone'}
                        </button>

                        {selectedZone && (
                            <>
                                <button
                                    onClick={() => {
                                        updateDetectionZone(selectedZone.id, { enabled: !selectedZone.enabled });
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] min-w-[44px] rounded-lg text-sm font-medium transition-colors active:scale-95 ${selectedZone.enabled
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                                        }`}
                                >
                                    {selectedZone.enabled ? <EyeIcon className="w-4 h-4" /> : <EyeOffIcon className="w-4 h-4" />}
                                    {selectedZone.enabled ? 'Enabled' : 'Disabled'}
                                </button>

                                <button
                                    onClick={() => {
                                        if (confirm(`Delete zone "${selectedZone.name}"?`)) {
                                            removeDetectionZone(selectedZone.id);
                                            setSelectedZoneId(null);
                                        }
                                    }}
                                    className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] min-w-[44px] rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors active:scale-95"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                    Delete
                                </button>
                            </>
                        )}
                    </div>

                    {/* Selected Zone Sensitivity Overrides */}
                    {selectedZone && (
                        <ZoneSensitivityPanel
                            zone={selectedZone}
                            globalSettings={{
                                motion: detectionZones.find(z => z.id === 'full')?.sensitivityOverride?.motion,
                                audio: detectionZones.find(z => z.id === 'full')?.sensitivityOverride?.audio,
                                pixel: detectionZones.find(z => z.id === 'full')?.sensitivityOverride?.pixel,
                            }}
                            onUpdate={(override) => updateDetectionZone(selectedZone.id, { sensitivityOverride: override })}
                        />
                    )}

                    {/* Zone List */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium text-slate-300">Detection Zones</h4>
                        {detectionZones.length === 0 ? (
                            <p className="text-sm text-slate-500">No zones defined. Click &quot;New Zone&quot; to draw one.</p>
                        ) : (
                            <div className="space-y-1">
                                {detectionZones.map((zone) => (
                                    <div
                                        key={zone.id}
                                        onClick={() => { setSelectedZoneId(zone.id); onZoneSelect?.(zone); }}
                                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${zone.id === selectedZoneId
                                                ? 'bg-blue-500/10 border border-blue-500/30'
                                                : 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`w-3 h-3 rounded-sm ${zone.enabled ? 'bg-emerald-500' : 'bg-slate-600'
                                                    }`}
                                            />
                                            {editingName === zone.id ? (
                                                <input
                                                    type="text"
                                                    value={newZoneName}
                                                    onChange={(e) => setNewZoneName(e.target.value)}
                                                    onBlur={() => {
                                                        if (newZoneName.trim()) {
                                                            updateDetectionZone(zone.id, { name: newZoneName.trim() });
                                                        }
                                                        setEditingName(null);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            if (newZoneName.trim()) {
                                                                updateDetectionZone(zone.id, { name: newZoneName.trim() });
                                                            }
                                                            setEditingName(null);
                                                        }
                                                        if (e.key === 'Escape') {
                                                            setEditingName(null);
                                                        }
                                                    }}
                                                    className="px-2 py-1 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                                                    autoFocus
                                                />
                                            ) : (
                                                <span
                                                    className="text-sm text-white cursor-text"
                                                    onDoubleClick={() => {
                                                        setEditingName(zone.id);
                                                        setNewZoneName(zone.name);
                                                    }}
                                                >
                                                    {zone.name}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs text-slate-500">
                                            {Math.round(zone.width)}×{Math.round(zone.height)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Icons
// =============================================================================

function CameraIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
    );
}

function PlusIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
    );
}

function EyeIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
    );
}

function EyeOffIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
    );
}

function TrashIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
    );
}

function SlidersIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
    );
}

// =============================================================================
// Zone Sensitivity Panel Component
// =============================================================================

interface ZoneSensitivityPanelProps {
    zone: DetectionZone;
    globalSettings: {
        motion?: number;
        audio?: number;
        pixel?: number;
    };
    onUpdate: (override: ZoneSensitivityOverride) => void;
}

function ZoneSensitivityPanel({ zone, onUpdate }: ZoneSensitivityPanelProps) {
    const { globalSettings } = useSettingsStore();
    const override = zone.sensitivityOverride || {};

    const handleMotionChange = (value: number | undefined) => {
        onUpdate({ ...override, motion: value });
    };

    const handleAudioChange = (value: number | undefined) => {
        onUpdate({ ...override, audio: value });
    };

    const handlePixelChange = (value: number | undefined) => {
        onUpdate({ ...override, pixel: value });
    };

    const hasOverrides = override.motion !== undefined || override.audio !== undefined || override.pixel !== undefined;

    return (
        <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <SlidersIcon className="w-4 h-4 text-blue-400" />
                    <h4 className="text-sm font-medium text-white">Zone Sensitivity</h4>
                </div>
                {hasOverrides && (
                    <button
                        onClick={() => onUpdate({})}
                        className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                        Reset to Global
                    </button>
                )}
            </div>
            <p className="text-xs text-slate-500">
                Override global settings for &quot;{zone.name}&quot;. Leave empty to use global values.
            </p>

            {/* Motion Sensitivity */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-400">Motion Sensitivity</label>
                    <div className="flex items-center gap-2">
                        {override.motion !== undefined ? (
                            <span className="text-xs text-blue-400 font-mono">{override.motion}%</span>
                        ) : (
                            <span className="text-xs text-slate-500 font-mono">Global ({globalSettings.motionSensitivity}%)</span>
                        )}
                        <button
                            onClick={() => handleMotionChange(override.motion !== undefined ? undefined : globalSettings.motionSensitivity)}
                            className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center text-sm transition-colors active:scale-95 ${
                                override.motion !== undefined
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-slate-700 text-slate-500 hover:text-slate-300'
                            }`}
                            title={override.motion !== undefined ? 'Use global value' : 'Override'}
                            aria-label={override.motion !== undefined ? 'Motion override enabled, click to use global value' : 'Click to override motion sensitivity'}
                        >
                            {override.motion !== undefined ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <circle cx="12" cy="12" r="8" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
                {override.motion !== undefined && (
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={override.motion}
                        onChange={(e) => handleMotionChange(Number(e.target.value))}
                        className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer
                                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6
                                   [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-blue-500
                                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                                   [&::-webkit-slider-thumb]:active:scale-110"
                    />
                )}
            </div>

            {/* Audio Sensitivity */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-400">Audio Sensitivity</label>
                    <div className="flex items-center gap-2">
                        {override.audio !== undefined ? (
                            <span className="text-xs text-purple-400 font-mono">{override.audio}%</span>
                        ) : (
                            <span className="text-xs text-slate-500 font-mono">Global ({globalSettings.audioSensitivity}%)</span>
                        )}
                        <button
                            onClick={() => handleAudioChange(override.audio !== undefined ? undefined : globalSettings.audioSensitivity)}
                            className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center text-sm transition-colors active:scale-95 ${
                                override.audio !== undefined
                                    ? 'bg-purple-500/20 text-purple-400'
                                    : 'bg-slate-700 text-slate-500 hover:text-slate-300'
                            }`}
                            title={override.audio !== undefined ? 'Use global value' : 'Override'}
                            aria-label={override.audio !== undefined ? 'Audio override enabled, click to use global value' : 'Click to override audio sensitivity'}
                        >
                            {override.audio !== undefined ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <circle cx="12" cy="12" r="8" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
                {override.audio !== undefined && (
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={override.audio}
                        onChange={(e) => handleAudioChange(Number(e.target.value))}
                        className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer
                                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6
                                   [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-purple-500
                                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                                   [&::-webkit-slider-thumb]:active:scale-110"
                    />
                )}
            </div>

            {/* Pixel Threshold */}
            <div className="space-y-1">
                <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-400">Pixel Threshold</label>
                    <div className="flex items-center gap-2">
                        {override.pixel !== undefined ? (
                            <span className="text-xs text-emerald-400 font-mono">{override.pixel}px</span>
                        ) : (
                            <span className="text-xs text-slate-500 font-mono">Global ({globalSettings.absolutePixelThreshold}px)</span>
                        )}
                        <button
                            onClick={() => handlePixelChange(override.pixel !== undefined ? undefined : globalSettings.absolutePixelThreshold)}
                            className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-lg flex items-center justify-center text-sm transition-colors active:scale-95 ${
                                override.pixel !== undefined
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-slate-700 text-slate-500 hover:text-slate-300'
                            }`}
                            title={override.pixel !== undefined ? 'Use global value' : 'Override'}
                            aria-label={override.pixel !== undefined ? 'Pixel threshold override enabled, click to use global value' : 'Click to override pixel threshold'}
                        >
                            {override.pixel !== undefined ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <circle cx="12" cy="12" r="8" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
                {override.pixel !== undefined && (
                    <input
                        type="range"
                        min={1}
                        max={1000}
                        step={1}
                        value={override.pixel}
                        onChange={(e) => handlePixelChange(Number(e.target.value))}
                        className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer
                                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6
                                   [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-emerald-500
                                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                                   [&::-webkit-slider-thumb]:active:scale-110"
                    />
                )}
            </div>
        </div>
    );
}

export default DetectionZoneEditor;
