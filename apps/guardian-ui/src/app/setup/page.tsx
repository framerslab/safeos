'use client';

/**
 * Setup/Onboarding Page
 *
 * Multi-step onboarding wizard with industrial, utilitarian design.
 * Clear, functional layout. No decorative elements.
 */

import { CameraPicker } from '../../components/CameraPicker';
import { useCameraStore } from '../../stores/camera-store';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore, canSkipOnboarding } from '../../stores/onboarding-store';
import {
  IconShield,
  IconShieldCheck,
  IconCamera,
  IconMic,
  IconPet,
  IconPaw,
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
import { SAFE_SLEEP_URL } from '../../components/NotAMedicalDevice';
import { SETUP_STEPS, type SetupStep } from '../../lib/setup-steps';

// =============================================================================
// Types
// =============================================================================

// The steps live in lib/setup-steps so the home page can print how many there
// are and which one asks for the camera.
type Step = SetupStep;

type Scenario = 'pet' | 'baby' | 'elderly' | 'security';
// What the question of what is being watched offers: the four uses, and Lost
// & Found, which compares the camera's picture with a pet's photos and so
// saves the pet use.
type Choice = Scenario | 'lost_found';

// The answers a visitor running setup again gives before the last step.
interface StagedAnswers {
  disclaimers: boolean;
  scenario: Scenario | null;
  camera: boolean | null;
  microphone: boolean | null;
}

const NO_ANSWERS: StagedAnswers = { disclaimers: false, scenario: null, camera: null, microphone: null };

const STEPS: Step[] = SETUP_STEPS;

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

  // Running setup again (/setup/?again=1, the home page's "Run setup again")
  // keeps each answer on this page and saves them all at the last step, so a
  // visitor who leaves part way keeps the setup they had.
  const [again, setAgain] = useState(false);
  const [staged, setStaged] = useState<StagedAnswers>(NO_ANSWERS);
  // The person chose Lost & Found in this run (null: no choice yet in this
  // run, so the saved choice stands). The last key then opens its page, where
  // the pet's photos are added. The saved choice is the watch's Watch for too,
  // whatever the use, so setup shows the one the watch last had.
  const [lostFoundNow, setLostFoundNow] = useState<boolean | null>(null);
  const lostFound = lostFoundNow ?? onboarding.lostFoundChosen;

  const currentIndex = STEPS.indexOf(currentStep);
  const progress = ((currentIndex + 1) / STEPS.length) * 100;

  // A person whose setup is done goes on to the dashboard, unless they asked
  // to run setup again. Arriving that way resets nothing: the saved setup
  // stays as it is until the last step is finished. The address is read here,
  // after the page has rendered: on a move from another page of the site the
  // address bar changes only then.
  // Set as the last step finishes. The forwarding below is for a person
  // arriving; once setup is finished here, the last key's page is the one opened.
  const finishing = useRef(false);
  useEffect(() => {
    if (finishing.current) return;
    const asked = new URLSearchParams(window.location.search).get('again') === '1';
    setAgain(asked);
    if (!asked && canSkipOnboarding(onboarding)) {
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

  // Each camera request has a number. "Continue without the camera" and a newer
  // request raise it, so an answer that arrives for an earlier request is
  // dropped: a prompt answered after the person went on changes nothing.
  const cameraRequest = useRef(0);

  // "Continue without the camera": setup goes on with both permissions
  // recorded as off. The Monitor page asks for the camera when monitoring starts.
  // A visitor running setup again keeps that answer on this page, like the
  // others, until the last step.
  const continueWithoutCamera = () => {
    cameraRequest.current += 1;
    if (again) {
      setStaged((answers) => ({ ...answers, camera: false, microphone: false }));
    } else {
      onboarding.setCameraPermission(false);
      onboarding.setMicrophonePermission(false);
    }
    goNext();
  };

  const requestPermissions = async () => {
    const request = ++cameraRequest.current;
    setPermissionError(null);
    setPermissionStatus('pending');
    const video = deviceId ? { deviceId: { exact: deviceId } } : true;
    // An old browser, or a page not served over https, has no camera request.
    const media: MediaDevices | undefined = navigator.mediaDevices;
    if (!media || typeof media.getUserMedia !== 'function') {
      setPermissionError('This browser cannot use a camera on this page.');
      return;
    }
    try {
      let microphone = true;
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      } catch (error) {
        // A camera without a microphone is enough to monitor video.
        if (!(error instanceof Error) || error.name !== 'NotFoundError') throw error;
        // A request the person has left behind asks the browser nothing more.
        if (request !== cameraRequest.current) return;
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        microphone = false;
      }
      if (request !== cameraRequest.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.getTracks().forEach((track) => track.stop());
      setPermissionStatus('granted');
      const heard = microphone && stream.getAudioTracks().length > 0;
      if (again) {
        setStaged((answers) => ({ ...answers, camera: true, microphone: heard }));
      } else {
        onboarding.setCameraPermission(true);
        onboarding.setMicrophonePermission(heard);
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      const denied = name === 'NotAllowedError' || name === 'SecurityError';
      if (request !== cameraRequest.current) return;
      setPermissionStatus(denied ? 'denied' : 'pending');
      setPermissionError(cameraRequestProblem(name, Boolean(deviceId)));
    }
  };

  const completeSetup = () => {
    finishing.current = true;
    onboarding.setLostFoundChosen(lostFound);
    if (again) {
      if (staged.disclaimers) onboarding.acceptAllDisclaimers();
      if (staged.scenario) onboarding.setScenario(staged.scenario);
      if (staged.camera !== null) onboarding.setCameraPermission(staged.camera);
      if (staged.microphone !== null) onboarding.setMicrophonePermission(staged.microphone);
    }
    onboarding.setComplete(true);
    router.push(lostFound ? '/lost-found/' : '/dashboard');
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
                if (again) setStaged((answers) => ({ ...answers, disclaimers: true }));
                else onboarding.acceptAllDisclaimers();
                goNext();
              }}
              onBack={goBack}
            />
          )}
          {currentStep === 'scenario' && (
            <ScenarioStep
              selectedScenario={lostFound ? 'lost_found' : staged.scenario ?? onboarding.selectedScenario}
              onSelect={(choice) => {
                const scenario: Scenario = choice === 'lost_found' ? 'pet' : choice;
                setLostFoundNow(choice === 'lost_found');
                if (again) setStaged((answers) => ({ ...answers, scenario }));
                else {
                  onboarding.setScenario(scenario);
                  onboarding.setLostFoundChosen(choice === 'lost_found');
                }
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
              onSkip={continueWithoutCamera}
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
            <CompleteStep onFinish={completeSetup} lostFound={lostFound} />
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * What the camera step says after a failed request, by the error's name.
 * `cameraChosen` is false while the menu is on "Default camera".
 */
function cameraRequestProblem(name: string, cameraChosen: boolean): string {
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'The browser blocked the camera for this site. To allow it, open the site settings from the address bar, set Camera to Allow, then press Try again.';
    case 'NotReadableError':
    case 'AbortError':
    case 'TrackStartError':
      return 'The camera did not start. Another app or tab may be using it. Close it, then press Try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return cameraChosen
        ? 'The selected camera is unavailable. Choose another camera.'
        : 'No camera was found on this device.';
    default:
      return 'Unable to access the camera or microphone. Check the device and try again.';
  }
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
          Free motion and sound alerts for pets, babies, and elderly care.
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
  selectedScenario: Choice | null;
  onSelect: (choice: Choice) => void;
  onBack: () => void;
}) {
  const scenarios: Array<{ id: Choice; label: string; description: string; icon: ReactNode }> = [
    {
      id: 'pet' as const,
      label: 'Pet Monitoring',
      description: 'Motion and sound alerts while your pet is in another room',
      icon: <IconPet size={24} />,
    },
    {
      id: 'baby' as const,
      label: 'Baby Monitoring',
      description:
        'Motion and sound alerts during a nap you stay nearby for. SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS.',
      icon: <IconBaby size={24} />,
    },
    {
      id: 'elderly' as const,
      label: 'Elderly Care',
      description: 'Motion and sound alerts, and an optional alert when nothing has moved for a time you set',
      icon: <IconElderly size={24} />,
    },
    {
      id: 'security' as const,
      label: 'Security Mode',
      description: 'Motion and sound alerts while the room is empty. The Security page counts the people in view.',
      icon: <IconShield size={24} />,
    },
    {
      id: 'lost_found' as const,
      label: 'Lost & Found',
      description:
        "Compares what the camera sees with your missing pet's photos, by colour and shape, and alerts you to take a look. You add the photos after setup.",
      icon: <IconPaw size={24} />,
    },
  ];
  // A scenario already chosen (saved earlier, or chosen before Back) is
  // confirmed with Continue.
  const chosen = selectedScenario;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-heading-sm">Select Monitoring Scenario</h2>
      </div>
      <div className="panel-body space-y-4">
        <p className="text-sm text-[var(--color-steel-400)]">
          Choose the primary use case. To change it later, run setup again from the home page.
        </p>

        <div className="grid gap-3">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => onSelect(scenario.id)}
              aria-pressed={selectedScenario === scenario.id}
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

        <p className="text-xs text-[var(--color-steel-400)]">
          <a href={SAFE_SLEEP_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Safe-sleep guidance (NIH)
          </a>
        </p>

        <div className="flex gap-3 pt-4">
          <button onClick={onBack} className="btn btn-secondary">
            <IconChevronLeft size={16} />
            Back
          </button>
          {chosen && (
            <button onClick={() => onSelect(chosen)} className="btn btn-primary flex-1">
              Continue
              <IconChevronRight size={16} />
            </button>
          )}
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
  onSkip,
  onBack,
}: {
  status: 'pending' | 'granted' | 'denied';
  errorMessage: string | null;
  onRequest: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  // Once a request has failed, the request key reads "Try again", also while
  // the next request waits for its answer.
  const [failedBefore, setFailedBefore] = useState(false);
  if (errorMessage && !failedBefore) setFailedBefore(true);

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
          Frames are processed in this browser unless you connect a server you run yourself.
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
          <div role="alert" className="p-3 rounded bg-[var(--color-alert-critical)]/10 border border-[var(--color-alert-critical)]/30">
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
              {failedBefore ? 'Try again' : 'Grant Permissions'}
            </button>
          )}
        </div>

        {status !== 'granted' && (
          <>
            <button type="button" onClick={onSkip} className="btn btn-secondary w-full min-h-11">
              Continue without the camera
              <IconChevronRight size={16} />
            </button>
            <p className="text-base text-[var(--color-steel-300)]">
              You can allow the camera later, on the Monitor page.
            </p>
          </>
        )}
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

function CompleteStep({ onFinish, lostFound }: { onFinish: () => void; lostFound: boolean }) {
  return (
    <div className="panel">
      <div className="panel-body text-center py-8">
        <div className="w-16 h-16 mx-auto mb-6 rounded-lg bg-[var(--color-accent-900)]/30 border border-[var(--color-accent-700)] flex items-center justify-center">
          <IconCheckCircle size={36} className="text-[var(--color-accent-500)]" />
        </div>

        <h1 className="text-heading-lg mb-2">Setup Complete</h1>
        <p className="text-[var(--color-steel-400)] mb-8 max-w-md mx-auto">
          {lostFound
            ? "Your Guardian system is configured. Next, add photos of your pet on the Lost & Found page; it compares what the camera sees with them."
            : 'Your Guardian system is configured and ready. You can now start monitoring.'}
        </p>

        <button onClick={onFinish} className="btn btn-primary px-8">
          {lostFound ? 'Open Lost and Found' : 'Launch Dashboard'}
          <IconChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
