'use client';

/**
 * Setup/Onboarding Page
 *
 * Multi-step onboarding wizard with industrial, utilitarian design.
 * Clear, functional layout. No decorative elements.
 */

import { CameraPicker } from '../../components/CameraPicker';
import { useCameraStore } from '../../stores/camera-store';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore, canSkipOnboarding } from '../../stores/onboarding-store';
import {
  IconShield,
  IconShieldCheck,
  IconCamera,
  IconMic,
  IconPet,
  IconBaby,
  IconElderly,
  IconBell,
  IconCheckCircle,
  IconAlertTriangle,
  IconChevronRight,
  IconChevronLeft,
  IconX,
} from '../../components/icons';
import { SafeOSLogo, FrameWordmark } from '../../components/Logo';

// =============================================================================
// Types
// =============================================================================

type Step = 'welcome' | 'disclaimer' | 'scenario' | 'permissions' | 'notifications' | 'complete';

const STEPS: Step[] = ['welcome', 'disclaimer', 'scenario', 'permissions', 'notifications', 'complete'];

// =============================================================================
// Setup Page Component
// =============================================================================

export default function SetupPage() {
  const router = useRouter();
  const onboarding = useOnboardingStore();
  const deviceId = useCameraStore(state => state.deviceId);
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [permissionStatus, setPermissionStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const currentIndex = STEPS.indexOf(currentStep);
  const progress = ((currentIndex + 1) / STEPS.length) * 100;

  // Check if we can skip onboarding - redirect to dashboard if already complete
  useEffect(() => {
    if (canSkipOnboarding(onboarding)) {
      router.push('/dashboard');
    }
  }, [onboarding, router]);

  const goNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const goBack = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const requestPermissions = async () => {
    setPermissionError(null);
    setPermissionStatus('pending');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: true,
      });
      stream.getTracks().forEach((track) => track.stop());
      setPermissionStatus('granted');
      onboarding.setCameraPermission(true);
      onboarding.setMicrophonePermission(true);
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const denied = name === 'NotAllowedError' || name === 'SecurityError';
      setPermissionStatus(denied ? 'denied' : 'pending');
      setPermissionError(name === 'OverconstrainedError' || name === 'NotFoundError'
        ? 'The selected camera is unavailable. Choose another camera.'
        : denied ? 'Permission denied. Please enable camera/microphone access in your browser settings.'
          : 'Unable to access the camera or microphone. Check the device and try again.');
    }
  };

  const completeSetup = () => {
    onboarding.setComplete(true);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[var(--color-steel-950)] flex flex-col">
      {/* Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--color-accent-600)] focus:text-white focus:rounded"
      >
        Skip to main content
      </a>

      {/* Header with Progress */}
      <header className="border-b border-[var(--color-steel-800)] bg-[var(--color-steel-900)]">
        <div className="container py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-[var(--color-steel-800)] border border-[var(--color-steel-700)] flex items-center justify-center">
                <IconShield size={18} className="text-[var(--color-accent-500)]" />
              </div>
              <span className="font-mono text-sm text-[var(--color-steel-400)] uppercase tracking-wider">
                System Setup
              </span>
            </div>
            <span className="font-mono text-xs text-[var(--color-steel-500)]">
              Step {currentIndex + 1} of {STEPS.length}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="progress-bar">
            <div
              className="progress-bar__fill transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-xl">
          {currentStep === 'welcome' && (
            <WelcomeStep onContinue={goNext} />
          )}
          {currentStep === 'disclaimer' && (
            <DisclaimerStep
              onAccept={() => {
                onboarding.acceptAllDisclaimers();
                goNext();
              }}
              onBack={goBack}
            />
          )}
          {currentStep === 'scenario' && (
            <ScenarioStep
              selectedScenario={onboarding.selectedScenario}
              onSelect={(scenario) => {
                onboarding.setScenario(scenario);
                goNext();
              }}
              onBack={goBack}
            />
          )}
          {currentStep === 'permissions' && (
            <PermissionsStep
              status={permissionStatus}
              errorMessage={permissionError}
              onRequest={requestPermissions}
              onContinue={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === 'notifications' && (
            <NotificationsStep
              onContinue={goNext}
              onBack={goBack}
            />
          )}
          {currentStep === 'complete' && (
            <CompleteStep onFinish={completeSetup} />
          )}
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// Step Components
// =============================================================================

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="panel">
      <div className="panel-body text-center py-8">
        <SafeOSLogo size={80} className="mx-auto mb-6 text-[var(--color-accent-500)]" />

        <h1 className="text-heading-lg mb-2">SafeOS Guardian</h1>
        <p className="text-[var(--color-steel-400)] mb-4 max-w-md mx-auto">
          Humanitarian AI monitoring for pets, babies, and elderly care.
        </p>
        <div className="flex justify-center mb-8">
          <FrameWordmark />
        </div>

        {/* Feature List */}
        <div className="grid gap-3 text-left max-w-sm mx-auto mb-8">
          <FeatureItem icon={<IconCamera size={18} />} text="Local-first video processing" />
          <FeatureItem icon={<IconBell size={18} />} text="Real-time alert notifications" />
          <FeatureItem icon={<IconShield size={18} />} text="Privacy-preserving design" />
        </div>

        <button onClick={onContinue} className="btn btn-primary w-full sm:w-auto px-8">
          Begin Setup
          <IconChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function FeatureItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded bg-[var(--color-steel-850)] border border-[var(--color-steel-800)]">
      <span className="text-[var(--color-accent-500)]">{icon}</span>
      <span className="text-sm text-[var(--color-steel-200)]">{text}</span>
    </div>
  );
}

function DisclaimerStep({
  onAccept,
  onBack,
}: {
  onAccept: () => void;
  onBack: () => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-heading-sm flex items-center gap-2">
          <IconAlertTriangle size={16} className="text-[var(--color-status-warning)]" />
          Important Disclaimers
        </h2>
      </div>
      <div className="panel-body space-y-4">
        <div className="p-4 rounded bg-[var(--color-steel-850)] border border-[var(--color-status-warning)]/30">
          <p className="text-sm text-[var(--color-steel-200)] mb-3">
            <strong className="text-[var(--color-status-warning)]">This is a supplementary monitoring tool.</strong>
          </p>
          <ul className="space-y-2 text-sm text-[var(--color-steel-400)]">
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-status-warning)]">•</span>
              Not a replacement for direct supervision or professional care
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-status-warning)]">•</span>
              AI analysis may produce false positives or miss events
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-status-warning)]">•</span>
              Response time depends on system load and connectivity
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-status-warning)]">•</span>
              Users are solely responsible for welfare of monitored subjects
            </li>
          </ul>
        </div>

        <label className="flex items-start gap-3 cursor-pointer p-3 rounded border border-[var(--color-steel-700)] hover:border-[var(--color-steel-600)]">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-2 border-[var(--color-steel-600)] bg-[var(--color-steel-850)] checked:bg-[var(--color-accent-600)] checked:border-[var(--color-accent-600)] focus:ring-[var(--color-accent-500)] focus:ring-offset-0"
          />
          <span className="text-sm text-[var(--color-steel-300)]">
            I understand these limitations and accept responsibility for proper supervision.
          </span>
        </label>

        <div className="flex gap-3 pt-4">
          <button onClick={onBack} className="btn btn-secondary">
            <IconChevronLeft size={16} />
            Back
          </button>
          <button
            onClick={onAccept}
            disabled={!checked}
            className="btn btn-primary flex-1"
          >
            Accept & Continue
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ScenarioStep({
  selectedScenario,
  onSelect,
  onBack,
}: {
  selectedScenario: 'pet' | 'baby' | 'elderly' | 'security' | null;
  onSelect: (scenario: 'pet' | 'baby' | 'elderly' | 'security') => void;
  onBack: () => void;
}) {
  const scenarios = [
    {
      id: 'pet' as const,
      label: 'Pet Monitoring',
      description: 'Track pet activity, detect barking, escape attempts',
      icon: <IconPet size={24} />,
    },
    {
      id: 'baby' as const,
      label: 'Baby Monitoring',
      description: 'Cry detection, movement alerts, sleep monitoring',
      icon: <IconBaby size={24} />,
    },
    {
      id: 'elderly' as const,
      label: 'Elderly Care',
      description: 'Fall detection, activity monitoring, wellness checks',
      icon: <IconElderly size={24} />,
    },
    {
      id: 'security' as const,
      label: 'Security Mode',
      description: 'Intruder detection, person counting, theft prevention',
      icon: <IconShield size={24} />,
    },
  ];

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-heading-sm">Select Monitoring Scenario</h2>
      </div>
      <div className="panel-body space-y-4">
        <p className="text-sm text-[var(--color-steel-400)]">
          Choose the primary use case. You can change this later in settings.
        </p>

        <div className="grid gap-3">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => onSelect(scenario.id)}
              className={`card flex items-center gap-4 text-left transition-all hover:border-[var(--color-steel-500)] ${
                selectedScenario === scenario.id
                  ? 'border-[var(--color-accent-600)] bg-[var(--color-accent-900)]/20'
                  : ''
              }`}
            >
              <div
                className={`w-12 h-12 rounded flex items-center justify-center flex-shrink-0 ${
                  selectedScenario === scenario.id
                    ? 'bg-[var(--color-accent-600)] text-white'
                    : 'bg-[var(--color-steel-800)] text-[var(--color-steel-400)]'
                }`}
              >
                {scenario.icon}
              </div>
              <div className="flex-1">
                <div className="font-mono text-sm font-medium text-[var(--color-steel-100)]">
                  {scenario.label}
                </div>
                <div className="text-xs text-[var(--color-steel-500)]">
                  {scenario.description}
                </div>
              </div>
              {selectedScenario === scenario.id && (
                <IconCheckCircle size={20} className="text-[var(--color-accent-500)]" />
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={onBack} className="btn btn-secondary">
            <IconChevronLeft size={16} />
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function PermissionsStep({
  status,
  errorMessage,
  onRequest,
  onContinue,
  onBack,
}: {
  status: 'pending' | 'granted' | 'denied';
  errorMessage: string | null;
  onRequest: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-heading-sm flex items-center gap-2">
          <IconCamera size={16} className="text-[var(--color-steel-500)]" />
          Device Access
        </h2>
      </div>
      <div className="panel-body space-y-4">
        <p className="text-sm text-[var(--color-steel-400)]">
          Camera and microphone access is required for monitoring.
          All processing happens locally on your device.
        </p>

        <CameraPicker refreshKey={status === 'granted'} />

        {/* Permission Items */}
        <div className="space-y-3">
          <PermissionItem
            icon={<IconCamera size={18} />}
            label="Camera Access"
            description="Video stream for visual monitoring"
            status={status}
          />
          <PermissionItem
            icon={<IconMic size={18} />}
            label="Microphone Access"
            description="Audio stream for sound detection"
            status={status}
          />
        </div>

        {errorMessage && (
          <div className="p-3 rounded bg-[var(--color-alert-critical)]/10 border border-[var(--color-alert-critical)]/30">
            <p className="text-sm text-[var(--color-alert-critical)]">
              {errorMessage}
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button onClick={onBack} className="btn btn-secondary">
            <IconChevronLeft size={16} />
            Back
          </button>
          {status === 'granted' ? (
            <button onClick={onContinue} className="btn btn-primary flex-1">
              Continue
              <IconChevronRight size={16} />
            </button>
          ) : (
            <button onClick={onRequest} className="btn btn-primary flex-1">
              Grant Permissions
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PermissionItem({
  icon,
  label,
  description,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  status: 'pending' | 'granted' | 'denied';
}) {
  return (
    <div className="flex items-center gap-4 p-3 rounded bg-[var(--color-steel-850)] border border-[var(--color-steel-800)]">
      <div className="w-10 h-10 rounded bg-[var(--color-steel-800)] flex items-center justify-center text-[var(--color-steel-400)]">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-[var(--color-steel-200)]">{label}</div>
        <div className="text-xs text-[var(--color-steel-500)]">{description}</div>
      </div>
      {status === 'granted' && (
        <IconCheckCircle size={20} className="text-[var(--color-accent-500)]" />
      )}
      {status === 'denied' && (
        <IconX size={20} className="text-[var(--color-alert-critical)]" />
      )}
    </div>
  );
}

function NotificationsStep({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const [browserPush, setBrowserPush] = useState(true);

  const requestNotificationPermission = async () => {
    if (browserPush && 'Notification' in window) {
      await Notification.requestPermission();
    }
    onContinue();
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-heading-sm flex items-center gap-2">
          <IconBell size={16} className="text-[var(--color-steel-500)]" />
          Notification Settings
        </h2>
      </div>
      <div className="panel-body space-y-4">
        <p className="text-sm text-[var(--color-steel-400)]">
          Configure how you receive alerts. Additional channels can be set up in settings.
        </p>

        <label className="flex items-center justify-between p-4 rounded bg-[var(--color-steel-850)] border border-[var(--color-steel-800)] cursor-pointer">
          <div className="flex items-center gap-3">
            <IconBell size={18} className="text-[var(--color-steel-400)]" />
            <div>
              <div className="text-sm font-medium text-[var(--color-steel-200)]">Browser Notifications</div>
              <div className="text-xs text-[var(--color-steel-500)]">Alerts on this device while your browser/app is running</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={browserPush}
            onChange={(e) => setBrowserPush(e.target.checked)}
            className="w-5 h-5 rounded border-2 border-[var(--color-steel-600)] bg-[var(--color-steel-850)] checked:bg-[var(--color-accent-600)] checked:border-[var(--color-accent-600)]"
          />
        </label>

        <p className="text-xs text-[var(--color-steel-500)]">
          Remote channels (SMS/Telegram/email) are optional and require a monitoring server (API) + provider credentials. SafeOS runs fully local/offline without it.
        </p>

        <div className="flex gap-3 pt-4">
          <button onClick={onBack} className="btn btn-secondary">
            <IconChevronLeft size={16} />
            Back
          </button>
          <button onClick={requestNotificationPermission} className="btn btn-primary flex-1">
            {browserPush ? 'Enable & Continue' : 'Skip & Continue'}
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CompleteStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="panel">
      <div className="panel-body text-center py-8">
        <div className="w-16 h-16 mx-auto mb-6 rounded-lg bg-[var(--color-accent-900)]/30 border border-[var(--color-accent-700)] flex items-center justify-center">
          <IconCheckCircle size={36} className="text-[var(--color-accent-500)]" />
        </div>

        <h1 className="text-heading-lg mb-2">Setup Complete</h1>
        <p className="text-[var(--color-steel-400)] mb-8 max-w-md mx-auto">
          Your Guardian system is configured and ready. You can now start monitoring.
        </p>

        <button onClick={onFinish} className="btn btn-primary px-8">
          Launch Dashboard
          <IconChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
