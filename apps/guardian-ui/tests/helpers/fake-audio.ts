/**
 * A stand-in Web Audio API for tests. It records what the sound manager
 * makes: each oscillator's shape, frequency, start and stop times, each gain's
 * value, every write to it and its scheduled changes, and what each node is
 * connected to.
 *
 * Its clock moves only through runClock, and only while the context runs: a
 * suspended context's time stands still. When the clock passes an oscillator's
 * stop time, the oscillator's onended runs, once. The stop time is the last
 * stop()'s (it replaces an earlier one), or the time of that call when the
 * clock had passed it: stop() and stop(0) are a stop now. The start time plays
 * no part, so a tone stopped before it starts ends at its stop time and not at
 * its start, as in the Web Audio API ("If a stop time is reached prior to the
 * scheduled start time, the sound will not play", and the ended event "is
 * dispatched when the stop time determined by stop() is reached":
 * https://webaudio.github.io/web-audio-api/#AudioScheduledSourceNode).
 * Setting a context's state fires its statechange event; close() sets it to
 * closed, and a closed context does not resume.
 */
import { jest } from '@jest/globals';

export class FakeParam {
  events: { kind: 'set' | 'ramp'; value: number; time: number }[] = [];
  /** Every value written to the param, in order. */
  writes: number[] = [];
  private current: number;

  constructor(value: number) {
    this.current = value;
  }

  get value(): number {
    return this.current;
  }

  set value(next: number) {
    this.current = next;
    this.writes.push(next);
  }

  setValueAtTime(value: number, time: number): FakeParam {
    this.events.push({ kind: 'set', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): FakeParam {
    this.events.push({ kind: 'ramp', value, time });
    return this;
  }

  cancelScheduledValues(): FakeParam {
    return this;
  }
}

export class FakeNode {
  // Every node this one was connected to; disconnect() only sets the flag.
  outputs: FakeNode[] = [];
  disconnected = false;

  connect(target: FakeNode): FakeNode {
    this.outputs.push(target);
    return target;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

export class FakeOscillator extends FakeNode {
  type: string = 'sine';
  frequency = new FakeParam(440);
  starts: number[] = [];
  /** The time given to each stop(), as given. */
  stops: number[] = [];
  ended = false;
  onended: (() => void) | null = null;
  /** When the last stop() takes effect: its time, or the clock's at the call when that is later. */
  private stopsAt: number | undefined;

  constructor(readonly context: FakeAudioContext) {
    super();
  }

  start(when = 0): void {
    this.starts.push(when);
    made.log.push(`start:${this.context.state}`);
  }

  stop(when = 0): void {
    this.stops.push(when);
    // A stop after the oscillator ended has no effect.
    if (!this.ended) this.stopsAt = Math.max(when, this.context.currentTime);
  }

  /** When the oscillator ends, if it was started and stopped. Its start time plays no part. */
  endsAt(): number | undefined {
    return this.starts.length === 0 ? undefined : this.stopsAt;
  }
}

export const made = {
  contexts: [] as FakeAudioContext[],
  oscillators: [] as FakeOscillator[],
  gains: [] as FakeGain[],
  log: [] as string[],
};

// How the next context starts and how it answers resume().
export const audioSetup = {
  state: 'running' as string,
  resume: (context: FakeAudioContext): Promise<void> => {
    context.state = 'running';
    return Promise.resolve();
  },
};

export class FakeAudioContext {
  currentTime = 0;
  destination = new FakeNode();
  onstatechange: (() => void) | null = null;
  private current: string = audioSetup.state;
  private listeners = new Set<() => void>();

  constructor() {
    made.contexts.push(this);
  }

  get state(): string {
    return this.current;
  }

  // A change of state fires statechange.
  set state(next: string) {
    if (next === this.current) return;
    this.current = next;
    this.onstatechange?.();
    this.listeners.forEach((listener) => listener());
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'statechange') this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === 'statechange') this.listeners.delete(listener);
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator(this);
    made.oscillators.push(oscillator);
    return oscillator;
  }

  createGain(): FakeGain {
    const gain = new FakeGain();
    made.gains.push(gain);
    return gain;
  }

  resume(): Promise<void> {
    made.log.push('resume');
    // A closed context cannot run again: resume() rejects.
    if (this.current === 'closed') return Promise.reject(invalidState('The context is closed'));
    return audioSetup.resume(this);
  }

  // close() sets the state to closed, which fires statechange; a second close() rejects.
  close(): Promise<void> {
    made.log.push('close');
    if (this.current === 'closed') return Promise.reject(invalidState('The context is closed'));
    this.state = 'closed';
    return Promise.resolve();
  }
}

function invalidState(message: string): Error {
  const error = new Error(message);
  error.name = 'InvalidStateError';
  return error;
}

/** Puts the stand-in back as a fresh browser has it, with contexts that start running. */
export function resetFakeAudio(): void {
  made.contexts.length = 0;
  made.oscillators.length = 0;
  made.gains.length = 0;
  made.log.length = 0;
  audioSetup.state = 'running';
  audioSetup.resume = (context) => {
    context.state = 'running';
    return Promise.resolve();
  };
}

// Lets resume() and the play that waits on it finish.
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

// Floating-point slack when the clock is compared with a stop time.
const EPSILON = 1e-9;

/**
 * Moves the timers on, 10 ms at a time, and the context's clock with them
 * while it runs; delivers the end of each oscillator whose stop time the clock
 * has passed, once.
 */
export async function runClock(context: FakeAudioContext, ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += 10) {
    if (context.state === 'running') context.currentTime += 0.01;
    for (const oscillator of made.oscillators) {
      if (oscillator.context !== context || oscillator.ended) continue;
      const endsAt = oscillator.endsAt();
      if (endsAt !== undefined && endsAt <= context.currentTime + EPSILON) {
        oscillator.ended = true;
        oscillator.onended?.();
      }
    }
    jest.advanceTimersByTime(10);
    await settle();
  }
}

// The gains that lead to the speakers: one per sound.
export function soundGains(): FakeGain[] {
  const destination = made.contexts[0]?.destination;
  return made.gains.filter((gain) => destination !== undefined && gain.outputs.includes(destination));
}

// The oscillators whose tones reach the given sound gain.
export function through(gain: FakeGain): FakeOscillator[] {
  return made.oscillators.filter((oscillator) => oscillator.outputs[0]?.outputs.includes(gain));
}

export const lastStop = (oscillator: FakeOscillator) => oscillator.stops[oscillator.stops.length - 1];

// The oscillators that were started.
export const started = () => made.oscillators.filter((oscillator) => oscillator.starts.length > 0);
