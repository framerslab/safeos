import { act, fireEvent, screen } from '@testing-library/react';

export class BrowserTrack extends EventTarget {
  readyState = 'live';
  muted = false;
  constructor(public kind: string) { super(); }
  stop = jest.fn(() => { this.readyState = 'ended'; });
  end() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')); }
  mute() { this.muted = true; this.dispatchEvent(new Event('mute')); }
}

export class BrowserSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: BrowserSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: any[] = [];
  constructor(public url: string) { BrowserSocket.instances.push(this); }
  send = (data: string) => { this.sent.push(JSON.parse(data)); };
  close = jest.fn(() => { this.readyState = 3; });
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}

export function installCameraBrowser() {
  BrowserSocket.instances = [];
  Object.defineProperty(global, 'WebSocket', { configurable: true, value: BrowserSocket });
  const video = new BrowserTrack('video');
  const audio = new BrowserTrack('audio');
  const stream = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
  const getUserMedia = jest.fn().mockResolvedValue(stream);
  const mediaDevices = Object.assign(new EventTarget(), {
    getUserMedia,
    enumerateDevices: jest.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'built-in', label: 'Built-in camera' },
      { kind: 'videoinput', deviceId: 'usb', label: 'USB camera' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
    ]),
  });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  let frame = 0;
  const readFrame = jest.fn(() => {
    const data = new Uint8ClampedArray(16 * 16 * 4).fill(++frame % 2 ? 0 : 255);
    return new ImageData(data, 16, 16);
  });
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    drawImage: jest.fn(), getImageData: readFrame,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,frame');
  const closeAudio = jest.fn().mockResolvedValue(undefined);
  class BrowserAudioContext {
    state = 'running';
    sampleRate = 44100;
    currentTime = 0;
    destination = {};
    createMediaStreamSource() { return { connect: jest.fn(), disconnect: jest.fn() }; }
    createAnalyser() { return { context: this, fftSize: 256, frequencyBinCount: 128,
      getByteFrequencyData: (data: Uint8Array) => data.fill(0),
      getByteTimeDomainData: (data: Uint8Array) => data.fill(128),
    }; }
    close = closeAudio;
  }
  Object.defineProperty(global, 'AudioContext', { configurable: true, value: BrowserAudioContext });
  Object.defineProperty(global, 'Notification', { configurable: true, value: Object.assign(jest.fn(), {
    permission: 'denied', requestPermission: jest.fn().mockResolvedValue('denied'),
  }) });
  return { video, audio, stream, getUserMedia, mediaDevices, readFrame, closeAudio };
}

export async function startMonitoring() {
  fireEvent.click(screen.getByRole('button', { name: 'Start Monitoring' }));
  await act(async () => {});
}
