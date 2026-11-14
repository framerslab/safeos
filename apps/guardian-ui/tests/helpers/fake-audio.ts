/**
 * A stand-in Web Audio API for tests. It records what the sound manager
 * makes: each oscillator's shape, frequency, start and stop times, each gain's
 * value, every write to it and its scheduled changes, and what each node is
 * connected to.
 *
 * Its clock moves only through runClock, and only while the context runs: a
 * suspended context's time stands still. When the clock passes an oscillator's
 * stop time (the last stop() replaces an earlier one), the oscillator's
 * onended runs, once. Setting a context's state fires its statechange event.
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
  stops: number[] = [];
  ended = false;
  onended: (() => void) | null = null;

  constructor(readonly context: FakeAudioContext) {
    super();
  }

  start(when = 0): void {
    this.starts.push(when);
    made.log.push(`start:${this.context.state}`);
  }

  stop(when = 0): void {
    this.stops.push(when);
  }

  /** When the oscillator ends: its last stop time, if it started and has one. */
  endsAt(): number | undefined {
    if (this.starts.length === 0 || this.stops.length === 0) return undefined;
    return Math.max(this.starts[0], this.stops[this.stops.length - 1]);
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
    return audioSetup.resume(this);
  }
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
