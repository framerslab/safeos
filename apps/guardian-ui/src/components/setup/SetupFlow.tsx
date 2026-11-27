/**
 * Setup's two steps on one address. Step 1 turns on the camera after saying
 * what SafeOS does on this device; step 2 shows the place live with two bars
 * to test it, asks what the device is watching (one of four uses, or a lost
 * pet) and ends on the key that opens the dashboard, the way whose row opened
 * setup or, for a lost pet, Lost and Found. A first setup writes each answer
 * at its press; a run again (?again=1) keeps every answer on the page until
 * the last key.
 *
 * @module components/setup/SetupFlow
 */

'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useBackendStatus } from '@/contexts/BackendStatusContext';
import { alertLines } from '@/lib/alert-lines';
import { wayFromParam, type Way } from '@/lib/app-routes';
import { useStorageEnds } from '@/lib/short-lived-storage';
import { answerFor, chosenOf, initialChoice, NO_ANSWERS, writeNow, type SetupAnswers, type SetupRun } from '@/lib/setup-answers';
import { useSetupStep } from '@/lib/setup-history';
import { SETUP_STEPS, type SetupChoice, type SetupUse } from '@/lib/setup-steps';
import { useCameraRequest } from '@/lib/use-camera-request';
import { finishHref, finishWay, useFinish } from '@/lib/use-finish';
import { useSavedLostFound, useSavedUse, useSetupState } from '@/lib/use-setup-done';
import { pathBefore } from '@/lib/visit-trail';
import { useCameraStore } from '@/stores/camera-store';
import { useSettingsStore, type ProcessingMode } from '@/stores/settings-store';
import { useWatchSettings } from '@/stores/watch-settings';
import { CameraStep } from './CameraStep';
import { LastKey } from './LastKey';
import { PlaceCheck } from './PlaceCheck';
import { StepFrame, StepHeading } from './StepFrame';
import { UseChoice } from './UseChoice';

/** A device sends the picture to its own server while it watches only with a server saved and a setting that processes there. */
export function sendsToServer(apiUrl: string, processingMode: ProcessingMode): boolean {
  return apiUrl.trim() !== '' && processingMode !== 'local';
}

interface Address {
  again: boolean;
  way: Way | null;
}

/** Setup's two steps on one address: the camera, then what the device watches with the last key. */
export function SetupFlow(): JSX.Element {
  const router = useRouter();
  const { config } = useBackendStatus();
  const storageEnds = useStorageEnds();

  // The address, read once.
  const [address, setAddress] = useState<Address | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAddress({ again: params.get('again') === '1', way: wayFromParam(params.get('next')) });
  }, []);

  // A device whose setup is done is sent on, in place of setup in the history.
  const setUp = useSetupState();
  const finished = useRef(false);
  useEffect(() => {
    if (address && setUp === true && !address.again && !finished.current) router.replace(finishHref(address.way));
  }, [address, setUp, router]);

  const run: SetupRun = address?.again ? 'again' : 'first';
  const runRef = useRef(run);
  runRef.current = run;

  const { step, entered, toStep2, backToStep1 } = useSetupStep();
  const shown = SETUP_STEPS[step - 1];

  // The camera: the one saved on this device, or the default once asked for.
  const deviceId = useCameraStore((state) => state.deviceId);
  const [defaultForVisit, setDefaultForVisit] = useState(false);
  const camera = useCameraRequest(defaultForVisit ? '' : deviceId);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [stopped, setStopped] = useState(false);

  // The answers kept on the page; a first setup also writes each at its press.
  const [answers, setAnswers] = useState<SetupAnswers>(NO_ANSWERS);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const answer = useCallback((patch: Partial<SetupAnswers>) => {
    setAnswers((now) => ({ ...now, ...patch }));
    if (runRef.current === 'first') writeNow(patch);
  }, []);

  // The use this device held when setup opened, taken once, and the answer
  // shown chosen on opening, as page state only.
  const savedUse = useSavedUse();
  const savedLostFound = useSavedLostFound();
  const usedBefore = useRef<SetupUse | null | undefined>(undefined);
  const pressed = useRef(false);
  const held = useRef(false);
  useEffect(() => {
    if (!address || savedUse === undefined || savedLostFound === undefined || held.current) return;
    held.current = true;
    usedBefore.current = savedUse;
    if (!pressed.current) {
      const initial = initialChoice(savedUse, savedLostFound, address.way);
      setAnswers((now) => ({ ...now, ...initial }));
    }
  }, [address, savedUse, savedLostFound]);
  const usedBeforeNow = usedBefore.current ?? null;

  // One rule for every way off a step: a waiting request is let go, and every
  // track of the open stream ends.
  const endCamera = useCallback(() => {
    cameraRef.current.drop();
    cameraRef.current.close();
  }, []);

  // A camera allowed: the answers take it, and step 1 moves on by itself. A
  // step 1 the browser moved on with no press counts the statement as read.
  const handled = useRef<MediaStream | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const stream = camera.stream;
    if (!stream || handled.current === stream) return;
    handled.current = stream;
    const patch: Partial<SetupAnswers> = { camera: true, microphone: camera.microphone };
    if (!answersRef.current.statement) patch.statement = true;
    answer(patch);
    setStopped(false);
    if (stepRef.current === 1) toStep2();
  }, [camera.stream, camera.microphone, answer, toStep2]);

  // Step 1 shown again, by Back or by the browser's back button: the camera
  // ends, and a camera that reads blocked or a browser with no camera request
  // is named again, as on opening.
  const lastStep = useRef(step);
  useEffect(() => {
    if (lastStep.current === 2 && step === 1) {
      endCamera();
      cameraRef.current.readAgain();
    }
    lastStep.current = step;
  }, [step, endCamera]);

  // Step 1's keys.
  const turnOn = () => {
    answer({ statement: true });
    void camera.request(camera.failure ? 'try-again' : 'turn-on');
  };
  const goOnWithout = () => {
    endCamera();
    answer({ statement: true, camera: false, microphone: false });
    toStep2();
  };
  const askDefaultCamera = () => {
    setDefaultForVisit(true);
    answer({ defaultCamera: true });
    void camera.request('default');
  };

  // Back: on step 1 the page before setup, else the home page; on step 2, step 1.
  const onBack = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    endCamera();
    if (step === 2) {
      backToStep1();
    } else if (pathBefore('/setup') !== null) {
      window.history.back();
    } else {
      router.push('/');
    }
  };
  const backHref = step === 1 ? '/' : `${window.location.pathname}${window.location.search}`;

  // Step 2: the lines the watch runs at for the use shown chosen.
  const globalSettings = useSettingsStore((state) => state.globalSettings);
  const scenarioOverrides = useSettingsStore((state) => state.scenarioOverrides);
  const { watchUse } = useWatchSettings();
  const lines = alertLines(answers.use, usedBeforeNow, globalSettings, scenarioOverrides, watchUse);

  const [missing, setMissing] = useState(false);
  const [focusFirst, setFocusFirst] = useState(0);
  const choose = (choice: SetupChoice) => {
    pressed.current = true;
    setMissing(false);
    answer(answerFor(choice));
  };

  const way = finishWay(answers.lostFound, address?.way ?? null);
  const finish = useFinish({
    answers,
    run,
    usedBefore: usedBeforeNow,
    way,
    closeCamera: endCamera,
    onMissingUse: () => {
      setMissing(true);
      setFocusFirst((n) => n + 1);
    },
    onFinished: () => {
      finished.current = true;
    },
  });

  const savedCamera = deviceId !== '' && !defaultForVisit;

  return (
    <StepFrame step={step} entered={entered} backHref={backHref} onBack={onBack}>
      {shown === 'camera' ? (
        <CameraStep
          ask={camera.ask}
          asking={camera.asking}
          failure={camera.failure}
          savedCamera={savedCamera}
          serverSaved={sendsToServer(config.apiUrl, globalSettings.processingMode)}
          storageEnds={storageEnds}
          focus={entered === 'change'}
          onTurnOn={turnOn}
          onDefaultCamera={askDefaultCamera}
          onContinue={goOnWithout}
        />
      ) : (
        <div className="setup-step--2">
          <StepHeading step={2} id="setup-step2-heading" focus={entered === 'change'}>
            What is it watching?
          </StepHeading>
          <div className="setup-check">
            <PlaceCheck
              stream={camera.stream}
              microphone={camera.microphone}
              stopped={stopped}
              failure={camera.failure}
              asking={camera.asking}
              lines={lines}
              savedCamera={savedCamera}
              onStopped={() => {
                setStopped(true);
                endCamera();
              }}
              onTurnOn={() => {
                void camera.request(stopped || camera.failure ? 'try-again' : 'turn-on');
              }}
              onDefaultCamera={askDefaultCamera}
            />
          </div>
          <div className="setup-answer">
            <UseChoice chosen={chosenOf(answers)} missing={missing} focusFirst={focusFirst} onChoose={choose} />
            <LastKey way={way} state={finish.state} onPress={finish.press} />
          </div>
        </div>
      )}
    </StepFrame>
  );
}

export default SetupFlow;
