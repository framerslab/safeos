/**
 * Jest Test Setup
 * 
 * Configuration and global mocks for unit tests.
 */

/// <reference types="jest" />

// Note: @testing-library/jest-dom can be added for enhanced matchers
// import '@testing-library/jest-dom';

// Mock canvas context for ImageData
class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: 'srgb' = 'srgb';

  constructor(data: Uint8ClampedArray | number, widthOrHeight?: number, height?: number) {
    if (typeof data === 'number') {
      this.width = data;
      this.height = widthOrHeight!;
      this.data = new Uint8ClampedArray(data * widthOrHeight! * 4);
    } else {
      this.data = data;
      this.width = widthOrHeight!;
      this.height = height!;
    }
  }
}

// Set up global ImageData for node environment
if (typeof global.ImageData === 'undefined') {
  (global as any).ImageData = MockImageData;
}

// Mock performance.now if not available
if (typeof performance === 'undefined') {
  (global as any).performance = {
    now: () => Date.now(),
  };
}

// Mock localStorage for zustand persist middleware
// Use a class to ensure proper method binding
class LocalStorageMock implements Storage {
  private store: Record<string, string> = {};
  
  get length(): number {
    return Object.keys(this.store).length;
  }
  
  clear(): void {
    this.store = {};
  }
  
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
  
  removeItem(key: string): void {
    delete this.store[key];
  }
  
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
}

const localStorageMock = new LocalStorageMock();

// A device that has answered the notice about alert pictures, so a watch
// starts at its key. A test that clears local storage and then imports the
// watch seeds this again.
const ALERT_PICTURES_ANSWERED = JSON.stringify({
  state: { keep: true, deleteAfterDays: 3, noticeAnswered: true, inNotifications: false },
  version: 0,
});
localStorageMock.setItem('safeos-alert-pictures', ALERT_PICTURES_ANSWERED);
beforeEach(() => {
  if (localStorageMock.getItem('safeos-alert-pictures') === null) {
    localStorageMock.setItem('safeos-alert-pictures', ALERT_PICTURES_ANSWERED);
  }
});

// Always set up localStorage mock (even if defined) to ensure consistency
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

Object.defineProperty(global, 'sessionStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Create a minimal window object if it doesn't exist
if (typeof global.window === 'undefined') {
  (global as any).window = {};
}

// Set localStorage on window as well
Object.defineProperty((global as any).window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

Object.defineProperty((global as any).window, 'sessionStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Only setup browser mocks if window is defined with proper DOM (jsdom environment)
if (typeof window !== 'undefined' && typeof HTMLCanvasElement !== 'undefined') {
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });

  // Mock HTMLCanvasElement.getContext
  HTMLCanvasElement.prototype.getContext = function(type: string) {
    if (type === '2d') {
      return {
        drawImage: jest.fn(),
        getImageData: jest.fn(() => new MockImageData(10, 10)),
        putImageData: jest.fn(),
        createImageData: jest.fn((w: number, h: number) => new MockImageData(w, h)),
        fillRect: jest.fn(),
        clearRect: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        scale: jest.fn(),
        translate: jest.fn(),
        rotate: jest.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  } as any;
}
