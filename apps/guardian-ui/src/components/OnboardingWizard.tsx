/**
 * Onboarding Wizard
 *
 * Guided setup for first-time users. Walks through:
 * 1. Welcome & use case selection
 * 2. Camera permissions
 * 3. Sensitivity tuning
 * 4. Optional features (sounds, notifications)
 *
 * @module components/OnboardingWizard
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSettingsStore, type PresetId, DEFAULT_PRESETS } from '../stores/settings-store';

// =============================================================================
// Types
// =============================================================================

type OnboardingStep = 'welcome' | 'use-case' | 'camera' | 'sensitivity' | 'features' | 'complete';

interface UseCase {
  id: string;
  preset: PresetId;
  icon: React.ReactNode;
  title: string;
  description: string;
}

// =============================================================================
// Constants
// =============================================================================

const ONBOARDING_KEY = 'guardian-onboarding-complete';

const USE_CASES: UseCase[] = [
  {
    id: 'baby',
    preset: 'infant_sleep',
    icon: <BabyIcon />,
    title: 'Baby Monitoring',
    description: 'High sensitivity for movement and sound detection',
  },
  {
    id: 'pet',
    preset: 'pet_sleep',
    icon: <PetIcon />,
    title: 'Pet Care',
    description: 'Balanced detection for pet activity monitoring',
  },
  {
    id: 'elderly',
    preset: 'maximum',
    icon: <ElderlyIcon />,
    title: 'Elderly Care',
    description: 'Inactivity monitoring and fall detection',
  },
  {
    id: 'security',
    preset: 'night',
    icon: <SecurityIcon />,
    title: 'Security',
    description: 'Intruder detection and motion alerts',
  },
  {
    id: 'wildlife',
    preset: 'night',
    icon: <WildlifeIcon />,
    title: 'Wildlife',
    description: 'Capture wildlife activity day or night',
  },
  {
    id: 'lost-found',
    preset: 'pet_sleep',
    icon: <LostFoundIcon />,
    title: 'Lost & Found',
    description: 'Spot lost pets or missing items',
  },
];

// =============================================================================
// Hook
// =============================================================================

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    setShowOnboarding(!completed);
    setIsChecking(false);
  }, []);

  const complete = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(ONBOARDING_KEY);
    setShowOnboarding(true);
  }, []);

  return { showOnboarding, isChecking, complete, reset };
}

// =============================================================================
// Main Component
// =============================================================================

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [enableSounds, setEnableSounds] = useState(true);

  const { setActivePreset, updateGlobalSettings } = useSettingsStore();

  // Check camera permission
  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'camera' as PermissionName }).then((result) => {
        setCameraPermission(result.state as 'prompt' | 'granted' | 'denied');
        result.onchange = () => {
          setCameraPermission(result.state as 'prompt' | 'granted' | 'denied');
        };
      }).catch(() => {
        // Fallback for browsers that don't support permissions API
      });
    }
  }, []);

  const requestCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setCameraPermission('granted');
      return true;
    } catch {
      setCameraPermission('denied');
      return false;
    }
  };

  const handleUseCaseSelect = (useCase: UseCase) => {
    setSelectedUseCase(useCase.id);
    setActivePreset(useCase.preset);
  };

  const handleComplete = () => {
    // Set alert volume based on user preference
    if (!enableSounds) {
      updateGlobalSettings({ alertVolume: 0 });
    }
    onComplete();
    router.push('/monitor');
  };

  const nextStep = () => {
    const steps: OnboardingStep[] = ['welcome', 'use-case', 'camera', 'sensitivity', 'features', 'complete'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: OnboardingStep[] = ['welcome', 'use-case', 'camera', 'sensitivity', 'features', 'complete'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Progress Bar */}
        <div className="h-1 bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
            style={{
              width: `${
                (((['welcome', 'use-case', 'camera', 'sensitivity', 'features', 'complete'].indexOf(step) + 1) /
                  6) *
                  100)
              }%`,
            }}
          />
        </div>

        {/* Content */}
        <div className="p-8">
          {step === 'welcome' && <WelcomeStep onNext={nextStep} />}
          {step === 'use-case' && (
            <UseCaseStep
              useCases={USE_CASES}
              selected={selectedUseCase}
              onSelect={handleUseCaseSelect}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {step === 'camera' && (
            <CameraStep
              permission={cameraPermission}
              onRequestPermission={requestCameraPermission}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {step === 'sensitivity' && (
            <SensitivityStep onNext={nextStep} onBack={prevStep} />
          )}
          {step === 'features' && (
            <FeaturesStep
              enableNotifications={enableNotifications}
              setEnableNotifications={setEnableNotifications}
              enableSounds={enableSounds}
              setEnableSounds={setEnableSounds}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}
          {step === 'complete' && (
            <CompleteStep onComplete={handleComplete} onBack={prevStep} />
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Step Components
// =============================================================================

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto bg-gradient-to-br from-emerald-500 to-blue-500 rounded-2xl flex items-center justify-center">
        <ShieldIcon className="w-10 h-10 text-white" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Welcome to SafeOS Guardian</h1>
        <p className="text-slate-400 max-w-md mx-auto">
          Free, privacy-first AI monitoring for your home. Let&apos;s set things up in just a few steps.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <span className="px-3 py-1 text-xs bg-emerald-500/10 text-emerald-400 rounded-full">100% Free</span>
        <span className="px-3 py-1 text-xs bg-blue-500/10 text-blue-400 rounded-full">Local Processing</span>
        <span className="px-3 py-1 text-xs bg-purple-500/10 text-purple-400 rounded-full">No Cloud Required</span>
      </div>
      <button
        onClick={onNext}
        className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
      >
        Get Started
      </button>
    </div>
  );
}

function UseCaseStep({
  useCases,
  selected,
  onSelect,
  onNext,
  onBack,
}: {
  useCases: UseCase[];
  selected: string | null;
  onSelect: (useCase: UseCase) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">What will you be monitoring?</h2>
        <p className="text-slate-400">Select your primary use case. You can change this anytime.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {useCases.map((useCase) => (
          <button
            key={useCase.id}
            onClick={() => onSelect(useCase)}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              selected === useCase.id
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
            }`}
          >
            <div className="w-10 h-10 mb-3 text-slate-400">{useCase.icon}</div>
            <h3 className="font-medium text-white text-sm">{useCase.title}</h3>
            <p className="text-xs text-slate-500 mt-1">{useCase.description}</p>
          </button>
        ))}
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!selected}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function CameraStep({
  permission,
  onRequestPermission,
  onNext,
  onBack,
}: {
  permission: 'prompt' | 'granted' | 'denied';
  onRequestPermission: () => Promise<boolean>;
  onNext: () => void;
  onBack: () => void;
}) {
  const [requesting, setRequesting] = useState(false);

  const handleRequest = async () => {
    setRequesting(true);
    await onRequestPermission();
    setRequesting(false);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Camera Access</h2>
        <p className="text-slate-400">We need camera access to start monitoring.</p>
      </div>

      <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700 text-center">
        {permission === 'granted' ? (
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center">
              <CheckIcon className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-emerald-400 font-medium">Camera access granted</p>
          </div>
        ) : permission === 'denied' ? (
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center">
              <XIcon className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-red-400 font-medium">Camera access denied</p>
            <p className="text-sm text-slate-500">
              Please enable camera access in your browser settings, then refresh the page.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto bg-blue-500/20 rounded-full flex items-center justify-center">
              <CameraIcon className="w-8 h-8 text-blue-400" />
            </div>
            <p className="text-slate-300">Click below to enable camera access</p>
            <button
              onClick={handleRequest}
              disabled={requesting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {requesting ? 'Requesting...' : 'Enable Camera'}
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
        >
          {permission === 'granted' ? 'Continue' : 'Skip for Now'}
        </button>
      </div>
    </div>
  );
}

function SensitivityStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { globalSettings, updateGlobalSettings, activePresetId } = useSettingsStore();
  const preset = activePresetId ? DEFAULT_PRESETS[activePresetId] : null;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Sensitivity Settings</h2>
        <p className="text-slate-400">
          {preset ? `Optimized for ${preset.name}` : 'Adjust detection sensitivity'}
        </p>
      </div>

      <div className="space-y-4">
        {/* Motion Sensitivity */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm text-slate-300">Motion Sensitivity</label>
            <span className="text-sm text-emerald-400 font-mono">{globalSettings.motionSensitivity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={globalSettings.motionSensitivity}
            onChange={(e) => updateGlobalSettings({ motionSensitivity: Number(e.target.value) })}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-emerald-500
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>

        {/* Audio Sensitivity */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm text-slate-300">Audio Sensitivity</label>
            <span className="text-sm text-purple-400 font-mono">{globalSettings.audioSensitivity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={globalSettings.audioSensitivity}
            onChange={(e) => updateGlobalSettings({ audioSensitivity: Number(e.target.value) })}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-purple-500
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>
      </div>

      <p className="text-xs text-slate-500 text-center">
        Higher sensitivity = more alerts. Lower = fewer false positives.
      </p>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function FeaturesStep({
  enableNotifications,
  setEnableNotifications,
  enableSounds,
  setEnableSounds,
  onNext,
  onBack,
}: {
  enableNotifications: boolean;
  setEnableNotifications: (v: boolean) => void;
  enableSounds: boolean;
  setEnableSounds: (v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Optional Features</h2>
        <p className="text-slate-400">Enable the features you want to use.</p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
          <div className="flex items-center gap-3">
            <BellIcon className="w-5 h-5 text-blue-400" />
            <div>
              <p className="font-medium text-white">Browser Notifications</p>
              <p className="text-xs text-slate-500">Get alerts even when the tab is in background</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={enableNotifications}
            onChange={(e) => setEnableNotifications(e.target.checked)}
            className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
          />
        </label>

        <label className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
          <div className="flex items-center gap-3">
            <SpeakerIcon className="w-5 h-5 text-purple-400" />
            <div>
              <p className="font-medium text-white">Alert Sounds</p>
              <p className="text-xs text-slate-500">Play audio alerts when events are detected</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={enableSounds}
            onChange={(e) => setEnableSounds(e.target.checked)}
            className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
          />
        </label>
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function CompleteStep({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto bg-gradient-to-br from-emerald-500 to-blue-500 rounded-full flex items-center justify-center">
        <CheckIcon className="w-10 h-10 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">You&apos;re All Set!</h2>
        <p className="text-slate-400 max-w-md mx-auto">
          Your monitoring system is ready. Press &apos;?&apos; anytime to see keyboard shortcuts.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <button
          onClick={onComplete}
          className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
        >
          Start Monitoring
        </button>
        <button onClick={onBack} className="text-sm text-slate-400 hover:text-white transition-colors">
          Go Back
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Icons
// =============================================================================

function ShieldIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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

function BellIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function SpeakerIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
  );
}

function BabyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20c0-3.314 2.686-6 6-6s6 2.686 6 6" />
      <path d="M9 7.5c0 .276-.224.5-.5.5s-.5-.224-.5-.5.224-.5.5-.5.5.224.5.5z" fill="currentColor" />
      <path d="M15.5 7.5c0 .276-.224.5-.5.5s-.5-.224-.5-.5.224-.5.5-.5.5.224.5.5z" fill="currentColor" />
    </svg>
  );
}

function PetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M10 5.5c0 1.38-1.12 2.5-2.5 2.5S5 6.88 5 5.5 6.12 3 7.5 3s2.5 1.12 2.5 2.5z" />
      <path d="M19 5.5c0 1.38-1.12 2.5-2.5 2.5S14 6.88 14 5.5 15.12 3 16.5 3s2.5 1.12 2.5 2.5z" />
      <path d="M5.5 12c0 1.38-1.12 2.5-2.5 2.5S.5 13.38.5 12 1.62 9.5 3 9.5s2.5 1.12 2.5 2.5z" />
      <path d="M23.5 12c0 1.38-1.12 2.5-2.5 2.5s-2.5-1.12-2.5-2.5 1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5z" />
      <path d="M12 21c-3 0-6-2.5-6-6 0-2 1.5-4 3-5s2-2 3-2 2 1 3 2 3 3 3 5c0 3.5-3 6-6 6z" />
    </svg>
  );
}

function ElderlyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <circle cx="12" cy="4" r="2" />
      <path d="M12 6v3" />
      <path d="M9 9h6l1 8h-2l-.5-4h-3l-.5 4H8l1-8z" />
      <path d="M10 17v4" />
      <path d="M14 17l2 4" />
      <path d="M7 11l-3 5" />
      <path d="M17 11l3 5" />
    </svg>
  );
}

function SecurityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function WildlifeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M8 3l-2 4-4 1 3 3-1 4 4-2 4 2-1-4 3-3-4-1-2-4z" />
      <path d="M16 11l-1 2-2 .5 1.5 1.5-.5 2 2-1 2 1-.5-2 1.5-1.5-2-.5-1-2z" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function LostFoundIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </svg>
  );
}

export default OnboardingWizard;
