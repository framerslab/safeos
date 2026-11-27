/** @jest-environment jsdom */
/**
 * Setup's step 1: turn on the camera
 *
 * The step says what this device will do, offers the camera in a drawn
 * frame with the line that says the browser will ask, waits for the answer
 * with its key inactive, always offers Continue without the camera, and
 * closes on the statement and where the picture goes.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CameraStep, type CameraStepProps } from '@/components/setup/CameraStep';
import { useMicrophoneAsk } from '@/lib/browser-asks';
import { FAILURE_WORDS, type CameraFailure } from '@/lib/setup-camera';

jest.mock('@/lib/browser-asks', () => ({
  ...jest.requireActual('@/lib/browser-asks'),
  useMicrophoneAsk: jest.fn(() => 'not-asked'),
}));

const microphone = useMicrophoneAsk as jest.Mock;

// The served-html helpers load jsdom themselves, which this environment
// cannot (it has no TextEncoder), so their reader is written here as it is
// there: an element's words as a reader takes them, with a straight and a
// curly apostrophe as one.
const words = (element: Element | null | undefined) =>
  (element?.textContent || '').replace(/’/g, "'").replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const LEAD =
  'SafeOS watches with the camera and microphone and sounds an alert here when something moves, makes a sound or, for a lost pet, when its colours come into view.';
const LINE = 'Your browser will ask you to allow the camera and microphone.';
const STATEMENT =
  'SafeOS adds an alert. It does not replace a person nearby. A phone or a browser can sleep, lose power or drop the camera, so stay within reach.';
const WINDOW = 'This browser forgets SafeOS when the window closes. Your settings and alerts last for this visit.';

let onTurnOn: jest.Mock;
let onDefaultCamera: jest.Mock;
let onContinue: jest.Mock;

function step(props: Partial<CameraStepProps> = {}) {
  return render(
    <CameraStep
      ask="not-asked"
      asking={null}
      failure={null}
      savedCamera={false}
      serverSaved={false}
      storageEnds={false}
      focus={false}
      onTurnOn={onTurnOn}
      onDefaultCamera={onDefaultCamera}
      onContinue={onContinue}
      {...props}
    />
  );
}

const follows = (first: Node, second: Node) => (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  onTurnOn = jest.fn();
  onDefaultCamera = jest.fn();
  onContinue = jest.fn();
  microphone.mockReturnValue('not-asked');
});
afterEach(() => {
  cleanup();
});

describe("setup's step 1", () => {
  it('shows the first screen in its order', () => {
    const { container } = step();
    const said = words(container);
    const order = [
      'Use this device to watch a place',
      LEAD,
      'Turn on the camera',
      LINE,
      'Continue without the camera',
      STATEMENT,
      'The picture stays on this device.',
    ].map((text) => said.indexOf(text.replace(/’/g, "'")));
    order.forEach((at) => expect(at).toBeGreaterThanOrEqual(0));
    order.slice(1).forEach((at, index) => expect(at).toBeGreaterThan(order[index]));

    const frame = container.querySelector('.setup-frame') as HTMLElement;
    const key = screen.getByRole('button', { name: 'Turn on the camera' });
    expect(frame.contains(key)).toBe(true);
    expect(frame.contains(container.querySelector('#setup-frame-line'))).toBe(true);
    const skip = screen.getByRole('button', { name: 'Continue without the camera' });
    expect(frame.contains(skip)).toBe(false);
    expect(follows(frame, skip)).toBe(true);
  });

  it("describes the key by the frame's line, and leaves the line out once the camera is allowed", () => {
    const { container } = step();
    expect(screen.getByRole('button', { name: 'Turn on the camera' }).getAttribute('aria-describedby')).toBe('setup-frame-line');
    cleanup();
    microphone.mockReturnValue('granted');
    const allowed = step({ ask: 'granted' });
    expect(allowed.container.querySelector('#setup-frame-line')).toBeNull();
    expect(screen.getByRole('button', { name: 'Turn on the camera' }).hasAttribute('aria-describedby')).toBe(false);
    expect(container).toBeTruthy();
  });

  it("keeps the frame's line while the browser will ask for the microphone", () => {
    for (const [camera, sound] of [
      ['granted', 'not-asked'],
      ['granted', 'unknown'],
      ['not-asked', 'granted'],
    ] as const) {
      microphone.mockReturnValue(sound);
      const { container } = step({ ask: camera });
      expect(words(container.querySelector('#setup-frame-line'))).toBe(LINE);
      expect(screen.getByRole('button', { name: 'Turn on the camera' }).getAttribute('aria-describedby')).toBe('setup-frame-line');
      cleanup();
    }
  });

  it("waits for the browser's answer with the key inactive and Continue active", () => {
    step({ asking: 'turn-on' });
    const key = screen.getByRole('button', { name: 'Waiting for your answer…' });
    expect(key.getAttribute('aria-busy')).toBe('true');
    expect(key.getAttribute('aria-disabled')).toBe('true');
    expect(key.classList.contains('setup-key--waiting')).toBe(true);
    fireEvent.click(key);
    expect(onTurnOn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('presses Turn on the camera and Continue without the camera', () => {
    step();
    fireEvent.click(screen.getByRole('button', { name: 'Turn on the camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
    expect(onTurnOn).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('says where the picture goes, once', () => {
    const server = step({ serverSaved: true });
    expect(words(server.container)).toContain('This device sends the picture to your own server while it watches.');
    expect(words(server.container)).not.toContain('The picture stays on this device.');
    cleanup();
    const here = step();
    expect(words(here.container)).toContain('The picture stays on this device.');
    expect(words(here.container)).not.toContain('This device sends the picture to your own server while it watches.');
  });

  it("says a private window forgets SafeOS under the lead, in the step's status region", () => {
    const ends = step({ storageEnds: true });
    const lead = ends.container.querySelector('.setup-lead') as HTMLElement;
    const status = ends.container.querySelector('p[role="status"]') as HTMLElement;
    expect(follows(lead, status)).toBe(true);
    expect(words(status)).toBe(WINDOW);
    cleanup();
    const lasts = step();
    expect(words(lasts.container.querySelector('p[role="status"]'))).toBe('');
  });
});

describe('step 1 when the camera does not turn on', () => {
  it.each(['blocked', 'closed', 'in-use', 'no-camera', 'saved-gone', 'unsupported', 'other'] as const)(
    'draws the %s failure inside the frame with its way on',
    (failure: CameraFailure) => {
      const { container } = step({ failure, savedCamera: failure === 'saved-gone' });
      const frame = container.querySelector('.setup-frame[data-state="failed"]') as HTMLElement;
      expect(frame).not.toBeNull();
      expect(frame.querySelector('svg.problem-mark')).not.toBeNull();
      expect(words(frame)).toContain(plain(FAILURE_WORDS[failure]));
      expect(frame.querySelector('.setup-camera-drawing')).toBeNull();
      expect(container.querySelector('#setup-frame-line')).toBeNull();
      if (failure === 'unsupported') {
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Turn on the camera' })).toBeNull();
      } else {
        expect(frame.contains(screen.getByRole('button', { name: 'Try again' }))).toBe(true);
      }
      if (failure === 'blocked') {
        const link = screen.getByRole('link', { name: 'How to allow the camera' });
        expect(bare(link.getAttribute('href'))).toBe('/help#camera');
      }
      if (failure === 'saved-gone') {
        expect(frame.contains(screen.getByRole('button', { name: 'Use the default camera' }))).toBe(true);
      }
      const skip = screen.getByRole('button', { name: 'Continue without the camera' });
      expect(frame.contains(skip)).toBe(false);
      expect(follows(frame, skip)).toBe(true);
    }
  );

  it('keeps focus on the pressed key when its failure shows', () => {
    const { rerender } = step();
    const key = screen.getByRole('button', { name: 'Turn on the camera' });
    key.focus();
    rerender(
      <CameraStep
        ask="not-asked"
        asking={null}
        failure="in-use"
        savedCamera={false}
        serverSaved={false}
        storageEnds={false}
        focus={false}
        onTurnOn={onTurnOn}
        onDefaultCamera={onDefaultCamera}
        onContinue={onContinue}
      />
    );
    expect(document.activeElement).toBe(key);
    expect(words(key)).toBe('Try again');
  });

  it('moves focus to Continue when the browser cannot use a camera', () => {
    const { rerender } = step();
    screen.getByRole('button', { name: 'Turn on the camera' }).focus();
    rerender(
      <CameraStep
        ask="not-asked"
        asking={null}
        failure="unsupported"
        savedCamera={false}
        serverSaved={false}
        storageEnds={false}
        focus={false}
        onTurnOn={onTurnOn}
        onDefaultCamera={onDefaultCamera}
        onContinue={onContinue}
      />
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Continue without the camera' }));
  });

  it("says the failure from the step's status region", () => {
    const failed = step({ failure: 'closed' });
    expect(words(failed.container.querySelector('.setup-frame-says[role="status"]'))).toBe(plain(FAILURE_WORDS.closed));
    cleanup();
    const rest = step();
    expect(words(rest.container.querySelector('.setup-frame-says[role="status"]'))).toBe('');
  });

  it('waits on Use the default camera with Try again inactive, the same key kept while its request is out', () => {
    const props = {
      ask: 'not-asked' as const,
      serverSaved: false,
      storageEnds: false,
      focus: false,
      onTurnOn,
      onDefaultCamera,
      onContinue,
    };
    const { container, rerender } = render(<CameraStep {...props} asking={null} failure="saved-gone" savedCamera />);
    const fallback = screen.getByRole('button', { name: 'Use the default camera' });
    fallback.focus();
    rerender(<CameraStep {...props} asking="default" failure="saved-gone" savedCamera={false} />);
    const waiting = container.querySelector('.setup-default') as HTMLElement;
    expect(waiting).toBe(fallback);
    expect(document.activeElement).toBe(fallback);
    expect(words(waiting)).toBe('Waiting for your answer…');
    expect(waiting.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('.setup-frame')?.getAttribute('data-state')).toBe('failed');
    const again = screen.getByRole('button', { name: 'Try again' });
    expect(again.getAttribute('aria-disabled')).toBe('true');
    expect(again.hasAttribute('aria-busy')).toBe(false);
    fireEvent.click(again);
    fireEvent.click(waiting);
    expect(onTurnOn).not.toHaveBeenCalled();
    expect(onDefaultCamera).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue without the camera' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('presses Use the default camera', () => {
    step({ failure: 'saved-gone', savedCamera: true });
    fireEvent.click(screen.getByRole('button', { name: 'Use the default camera' }));
    expect(onDefaultCamera).toHaveBeenCalledTimes(1);
  });
});
