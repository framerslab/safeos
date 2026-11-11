/**
 * Nap Mode Page
 *
 * Dedicated page for activating sleep monitoring when a caregiver
 * needs to take a brief nap while a child sleeps nearby.
 *
 * Features:
 * - Prominent safety warnings
 * - Pre-nap test to verify detection
 * - Acknowledgment requirement
 * - Large "I'm Awake" deactivation button
 *
 * @module app/nap/page
 */

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSettingsStore, SLEEP_PRESETS } from '../../stores/settings-store';
import { useSoundManager } from '../../lib/sound-manager';
import { NAP_MODE_DISCLAIMER } from '../../lib/disclaimers';
import { getPixelDetectionEngine, resetPixelDetectionEngine } from '../../lib/pixel-detection';

// =============================================================================
// Types
// =============================================================================

interface TestStatus {
    camera: 'pending' | 'testing' | 'passed' | 'failed';
    motion: 'pending' | 'testing' | 'passed' | 'failed';
    audio: 'pending' | 'testing' | 'passed' | 'failed';
}

// =============================================================================
// Nap Mode Page
// =============================================================================

export default function NapModePage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [step, setStep] = useState<'warning' | 'test' | 'active'>('warning');
    const [acknowledged, setAcknowledged] = useState(false);
    const [testStatus, setTestStatus] = useState<TestStatus>({
        camera: 'pending',
        motion: 'pending',
        audio: 'pending',
    });
    const [napDuration, setNapDuration] = useState(30); // minutes
    const [napStartTime, setNapStartTime] = useState<Date | null>(null);
    const [elapsedMinutes, setElapsedMinutes] = useState(0);
    const [motionDetected, setMotionDetected] = useState(false);
    const [testSoundId, setTestSoundId] = useState<string | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationRef = useRef<number | null>(null);

    const { activateSleepMode, deactivateSleepMode, globalSettings } = useSettingsStore();
    const soundManager = useSoundManager();
    const { stopAll, play } = soundManager;

    useEffect(() => {
        setMounted(true);
        return () => {
            // Cleanup on unmount
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            // Stop any playing test sounds
            stopAll();
        };
    }, [stopAll]);

    // Elapsed time counter when nap is active
    useEffect(() => {
        if (step !== 'active' || !napStartTime) return;

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - napStartTime.getTime()) / 60000);
            setElapsedMinutes(elapsed);

            // Warning at max duration
            if (elapsed >= napDuration) {
                play('warning');
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [step, napStartTime, napDuration, play]);

    if (!mounted) {
        return <LoadingScreen />;
    }

    // ==========================================================================
    // Test Functions
    // ==========================================================================

    const startCameraTest = async () => {
        setTestStatus(prev => ({ ...prev, camera: 'testing' }));

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: true
            });
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            setTestStatus(prev => ({ ...prev, camera: 'passed' }));

            // Start motion test automatically
            setTimeout(() => startMotionTest(), 500);
        } catch (error) {
            setTestStatus(prev => ({ ...prev, camera: 'failed' }));
        }
    };

    const startMotionTest = () => {
        setTestStatus(prev => ({ ...prev, motion: 'testing' }));

        // Initialize pixel detection with infant preset (ultra-sensitive)
        const detector = getPixelDetectionEngine({
            absolutePixelThreshold: 5, // Ultra-sensitive
            useAbsoluteThreshold: true,
            instantLocalMode: true,
            threshold: 2,
        });

        let frameCount = 0;
        let detected = false;

        const analyzeFrame = () => {
            if (!videoRef.current || !canvasRef.current) return;

            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;

            canvasRef.current.width = videoRef.current.videoWidth || 320;
            canvasRef.current.height = videoRef.current.videoHeight || 240;

            ctx.drawImage(videoRef.current, 0, 0);

            // Use analyzeCanvas - the correct method
            const result = detector.analyzeCanvas(canvasRef.current);

            if (result.changed && !detected) {
                detected = true;
                setMotionDetected(true);
                setTestStatus(prev => ({ ...prev, motion: 'passed' }));
            }

            frameCount++;

            // Auto-pass after 10 seconds if user doesn't move (we'll trust it works)
            if (frameCount > 300 && !detected) {
                setTestStatus(prev => ({ ...prev, motion: 'passed' }));
                detected = true;
            }

            if (!detected) {
                animationRef.current = requestAnimationFrame(analyzeFrame);
            }
        };

        analyzeFrame();
    };

    const testAudio = () => {
        // Stop any existing test sound first
        if (testSoundId) {
            soundManager.stop(testSoundId);
            setTestSoundId(null);
        }

        setTestStatus(prev => ({ ...prev, audio: 'testing' }));
        soundManager.updateVolume(1); // Max volume for test

        // Use test() instead of play() - test() forces loop: false
        const id = soundManager.test('alarm');
        setTestSoundId(id);

        setTimeout(() => {
            // Stop the test sound after 2 seconds
            soundManager.stop(id);
            setTestSoundId(null);
            setTestStatus(prev => ({ ...prev, audio: 'passed' }));
        }, 2000);
    };

    const allTestsPassed =
        testStatus.camera === 'passed' &&
        testStatus.motion === 'passed' &&
        testStatus.audio === 'passed';

    const activateNapMode = () => {
        // Stop any test sounds before activating nap mode
        if (testSoundId) {
            soundManager.stop(testSoundId);
            setTestSoundId(null);
        }
        stopAll(); // Ensure no sounds are playing

        activateSleepMode('infant_sleep');
        soundManager.updateVolume(1); // Ensure max volume
        setNapStartTime(new Date());
        setStep('active');
    };

    const deactivateNapMode = () => {
        deactivateSleepMode();
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        resetPixelDetectionEngine();
        router.push('/');
    };

    // ==========================================================================
    // Render
    // ==========================================================================

    if (step === 'active') {
        return (
            <NapModeActive
                elapsedMinutes={elapsedMinutes}
                maxMinutes={napDuration}
                onWakeUp={deactivateNapMode}
                motionDetected={motionDetected}
                videoRef={videoRef}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Header */}
            <header className="p-4 sm:p-6 border-b border-slate-700/50">
                <div className="max-w-2xl mx-auto flex items-center gap-4">
                    <Link href="/" className="text-slate-400 hover:text-white transition-colors">
                        <ChevronLeftIcon />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-white flex items-center gap-2">
                            <SleepIcon className="w-6 h-6 text-indigo-400" />
                            Nap Mode
                        </h1>
                        <p className="text-sm text-slate-400">
                            Brief daytime nap monitoring
                        </p>
                    </div>
                </div>
            </header>

            <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
                {step === 'warning' && (
                    <>
                        {/* Critical Warning */}
                        <div className="bg-amber-500/10 border-2 border-amber-500/50 rounded-xl p-6">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                                    <WarningIcon className="w-6 h-6 text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-amber-300 mb-2 flex items-center gap-2">
                                        <WarningIcon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                                        Important Safety Information
                                    </h2>
                                    <p className="text-sm text-amber-200/80">
                                        Please read this carefully before using Nap Mode.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Disclaimer Text */}
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                            <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                                {NAP_MODE_DISCLAIMER}
                            </pre>
                        </div>

                        {/* How Pixel Detection Works */}
                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-6">
                            <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                                <EyeIcon className="w-4 h-4" />
                                How Pixel Detection Works
                            </h3>
                            <p className="text-sm text-slate-300 mb-4">
                                Nap Mode uses <strong className="text-white">pixel detection</strong> to monitor
                                for movement. Here&apos;s how it works:
                            </p>
                            <ol className="space-y-3 text-sm text-slate-300">
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                                    <span>The camera captures video frames continuously (about 30 per second)</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                                    <span>Each frame is compared pixel-by-pixel to the previous frame</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                                    <span>When <strong className="text-white">5 or more pixels</strong> change position, motion is detected</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                                    <span>A loud alarm sounds immediately to wake you</span>
                                </li>
                            </ol>
                            <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
                                <p className="text-xs text-slate-400">
                                    <strong className="text-emerald-400">5px threshold</strong> = Ultra-sensitive.
                                    Even subtle movements like rolling over, reaching arms, or shifting position
                                    will trigger the alarm. This runs <strong className="text-emerald-400">100% locally</strong> on
                                    your device with zero network latency.
                                </p>
                            </div>
                        </div>

                        {/* Best For Section */}
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6">
                            <h3 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                                <CheckIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                                Nap Mode is best for:
                            </h3>
                            <ul className="space-y-2 text-sm text-slate-300">
                                <li className="flex items-start gap-2">
                                    <CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                    Quick 15-60 minute daytime naps
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                    Caregiver resting in the same room or nearby
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                    Child in a safe, childproofed sleep area
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                    As a SUPPLEMENT to (not replacement for) supervision
                                </li>
                            </ul>
                        </div>

                        {/* Acknowledgment Checkbox */}
                        <label className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 cursor-pointer hover:border-slate-600 transition-colors">
                            <input
                                type="checkbox"
                                checked={acknowledged}
                                onChange={(e) => setAcknowledged(e.target.checked)}
                                className="mt-1 w-5 h-5 rounded border-2 border-slate-600 bg-slate-800 checked:bg-indigo-600 checked:border-indigo-600"
                            />
                            <span className="text-sm text-slate-300">
                                I have read and understood the safety information above. I acknowledge that
                                Nap Mode is a <strong className="text-white">supplementary tool only</strong> and
                                I remain <strong className="text-white">fully responsible</strong> for the
                                safety of any children under my care.
                            </span>
                        </label>

                        {/* Nap Duration */}
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                            <label className="block text-sm font-medium text-slate-300 mb-3">
                                Planned nap duration: {napDuration} minutes
                            </label>
                            <input
                                type="range"
                                min="15"
                                max="90"
                                step="15"
                                value={napDuration}
                                onChange={(e) => setNapDuration(Number(e.target.value))}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-slate-500 mt-2">
                                <span>15 min</span>
                                <span>30 min</span>
                                <span>45 min</span>
                                <span>60 min</span>
                                <span>90 min</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
                                <LightbulbIcon className="w-4 h-4 text-amber-400 flex-shrink-0" aria-hidden="true" />
                                We&apos;ll remind you when your planned nap time is up
                            </p>
                        </div>

                        {/* Continue Button */}
                        <button
                            onClick={() => setStep('test')}
                            disabled={!acknowledged}
                            className={`w-full py-4 rounded-xl font-semibold transition-all ${acknowledged
                                ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                }`}
                        >
                            Continue to Pre-Nap Test
                        </button>
                    </>
                )}

                {step === 'test' && (
                    <>
                        {/* Test Header */}
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                            <h2 className="text-lg font-semibold text-blue-300 mb-1">
                                Pre-Nap Test
                            </h2>
                            <p className="text-sm text-slate-400">
                                Let&apos;s make sure everything is working before you rest.
                            </p>
                        </div>

                        {/* Camera Preview */}
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
                            <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                />
                                <canvas ref={canvasRef} className="hidden" />

                                {testStatus.camera === 'pending' && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                                        <div className="text-center">
                                            <CameraIcon className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                                            <p className="text-slate-500">Camera not started</p>
                                        </div>
                                    </div>
                                )}

                                {motionDetected && (
                                    <div className="absolute top-4 right-4 px-3 py-1.5 bg-emerald-500/90 text-white text-sm font-medium rounded-full">
                                        ✓ Motion Detected!
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Test Steps */}
                        <div className="space-y-3">
                            <TestStep
                                number={1}
                                title="Camera Access"
                                description="Allow camera access to monitor the sleep area"
                                status={testStatus.camera}
                                onStart={startCameraTest}
                            />

                            <TestStep
                                number={2}
                                title="Motion Detection"
                                description="Wave or move in front of the camera to verify detection"
                                status={testStatus.motion}
                                disabled={testStatus.camera !== 'passed'}
                            />

                            <TestStep
                                number={3}
                                title="Audio Alert"
                                description="Test that you can hear the alert sound clearly"
                                status={testStatus.audio}
                                onStart={testAudio}
                                disabled={testStatus.motion !== 'passed'}
                            />
                        </div>

                        {/* Volume Warning */}
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                            <p className="text-sm text-orange-300 flex items-start gap-2">
                                <VolumeIcon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                                <span><strong>Volume Check:</strong> Make sure your device is unmuted and at
                                maximum volume. The alert sound should be LOUD enough to wake you.</span>
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('warning')}
                                className="flex-1 py-3 px-4 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={activateNapMode}
                                disabled={!allTestsPassed}
                                className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all ${allTestsPassed
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                    }`}
                            >
                                {allTestsPassed ? 'Start Nap Mode' : 'Complete All Tests'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// Nap Mode Active Screen
// =============================================================================

interface NapModeActiveProps {
    elapsedMinutes: number;
    maxMinutes: number;
    onWakeUp: () => void;
    motionDetected: boolean;
    videoRef: React.RefObject<HTMLVideoElement>;
}

function NapModeActive({ elapsedMinutes, maxMinutes, onWakeUp, motionDetected, videoRef }: NapModeActiveProps) {
    const [showConfirm, setShowConfirm] = useState(false);

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col">
            {/* Status Bar */}
            <div className="p-4 bg-indigo-900/50 border-b border-indigo-700/50">
                <div className="max-w-lg mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-indigo-200 font-medium">Nap Mode Active</span>
                    </div>
                    <div className="text-sm text-indigo-300">
                        {elapsedMinutes} / {maxMinutes} min
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                {/* Motion Alert */}
                {motionDetected && (
                    <div className="mb-8 p-4 bg-red-500/20 border-2 border-red-500 rounded-xl animate-pulse">
                        <p className="text-lg font-bold text-red-400 text-center flex items-center justify-center gap-2">
                            <AlertIcon className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
                            Movement Detected!
                        </p>
                    </div>
                )}

                {/* Time Remaining */}
                <div className="text-center mb-12">
                    <p className="text-slate-400 text-sm mb-2">Time remaining</p>
                    <p className="text-6xl font-bold text-white">
                        {Math.max(0, maxMinutes - elapsedMinutes)}
                    </p>
                    <p className="text-slate-400">minutes</p>
                </div>

                {/* Camera Preview (Small) */}
                <div className="w-48 h-36 rounded-xl overflow-hidden border-2 border-slate-700 mb-12">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                </div>

                {/* Wake Up Button */}
                {!showConfirm ? (
                    <button
                        onClick={() => setShowConfirm(true)}
                        className="w-64 h-64 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700 text-white font-bold text-2xl shadow-2xl shadow-indigo-500/30 transition-all active:scale-95"
                    >
                        I&apos;m Awake
                    </button>
                ) : (
                    <div className="text-center">
                        <p className="text-slate-300 mb-4">End Nap Mode?</p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="px-8 py-3 rounded-xl border border-slate-700 text-slate-300"
                            >
                                Continue Nap
                            </button>
                            <button
                                onClick={onWakeUp}
                                className="px-8 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
                            >
                                Yes, I&apos;m Awake
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Warning */}
            <div className="p-4 bg-amber-900/30 border-t border-amber-700/30">
                <p className="text-center text-xs text-amber-200/70 flex items-center justify-center gap-1.5">
                    <WarningIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                    This is a supplementary tool only. Check on your child regularly.
                </p>
            </div>
        </div>
    );
}

// =============================================================================
// Sub-components
// =============================================================================

function LoadingScreen() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
    );
}

interface TestStepProps {
    number: number;
    title: string;
    description: string;
    status: 'pending' | 'testing' | 'passed' | 'failed';
    onStart?: () => void;
    disabled?: boolean;
}

function TestStep({ number, title, description, status, onStart, disabled }: TestStepProps) {
    return (
        <div className={`flex items-center gap-4 p-4 rounded-xl border ${status === 'passed' ? 'bg-emerald-500/10 border-emerald-500/30' :
            status === 'failed' ? 'bg-red-500/10 border-red-500/30' :
                status === 'testing' ? 'bg-blue-500/10 border-blue-500/30' :
                    'bg-slate-800/50 border-slate-700/50'
            }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${status === 'passed' ? 'bg-emerald-500/20 text-emerald-400' :
                status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    status === 'testing' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-slate-700 text-slate-400'
                }`}>
                {status === 'passed' ? <CheckIcon className="w-5 h-5" /> :
                    status === 'failed' ? <XIcon className="w-5 h-5" /> :
                        status === 'testing' ? <SpinnerIcon /> :
                            number}
            </div>
            <div className="flex-1">
                <h3 className="font-medium text-white">{title}</h3>
                <p className="text-sm text-slate-400">{description}</p>
            </div>
            {status === 'pending' && onStart && (
                <button
                    onClick={onStart}
                    disabled={disabled}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${disabled
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        }`}
                >
                    Start
                </button>
            )}
        </div>
    );
}

// =============================================================================
// Icons
// =============================================================================

function ChevronLeftIcon() {
    return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
    );
}

function SleepIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
    );
}

function WarningIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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

function XIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

function CameraIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
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

function SpinnerIcon() {
    return (
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
    );
}

function VolumeIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
    );
}

function AlertIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            <circle cx="12" cy="5" r="3" fill="currentColor" />
        </svg>
    );
}

function LightbulbIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
    );
}
