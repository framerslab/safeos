/**
 * Security Store Tests
 * 
 * Unit tests for the security store managing anti-theft/intruder
 * detection settings and state.
 * 
 * @module tests/security-store.test
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// localStorage is mocked in setup.ts

// =============================================================================
// Imports
// =============================================================================

import {
  useSecurityStore,
  DEFAULT_SECURITY_SETTINGS,
  createIntrusionFrame,
  getAlertModeLabel,
  getAlertModeDescription,
  getArmingStateLabel,
  getArmingStateColor,
  selectIsArmed,
  selectIsTriggered,
  selectPersonExcess,
  selectHasExcess,
  type SecurityState,
  type IntrusionFrame,
} from '../src/stores/security-store';

// =============================================================================
// Helper Functions
// =============================================================================

function createMockIntrusionFrame(
  personCount: number = 3,
  allowedCount: number = 0
): IntrusionFrame {
  return createIntrusionFrame(
    'data:image/jpeg;base64,mock',
    personCount,
    allowedCount,
    [{ bbox: [10, 20, 100, 200], confidence: 0.95 }]
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('Security Store', () => {
  beforeEach(() => {
    // Clear storage
    localStorage.clear();
    jest.clearAllMocks();
    
    // Reset store to initial state
    useSecurityStore.setState({
      armingState: 'disarmed',
      settings: { ...DEFAULT_SECURITY_SETTINGS },
      currentPersonCount: 0,
      lastDetectionTime: null,
      lastTriggerTime: null,
      armingTimeRemaining: 0,
      intrusionFrames: [],
      totalIntrusionEvents: 0,
      lastIntrusionTime: null,
    });
  });

  describe('Default Settings', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_SECURITY_SETTINGS.allowedPersons).toBe(0);
      expect(DEFAULT_SECURITY_SETTINGS.alertMode).toBe('extreme');
      expect(DEFAULT_SECURITY_SETTINGS.confidenceThreshold).toBeGreaterThan(0);
      expect(DEFAULT_SECURITY_SETTINGS.alerts.sirenEnabled).toBe(true);
      expect(DEFAULT_SECURITY_SETTINGS.alerts.tts.enabled).toBe(true);
    });

    it('should have alert settings', () => {
      expect(DEFAULT_SECURITY_SETTINGS.alerts.sirenVolume).toBeGreaterThan(0);
      expect(DEFAULT_SECURITY_SETTINGS.alerts.flashEnabled).toBe(true);
      expect(DEFAULT_SECURITY_SETTINGS.alerts.tts.rate).toBeGreaterThan(0);
    });
  });

  describe('Initial State', () => {
    it('should have correct initial arming state', () => {
      const state = useSecurityStore.getState();
      expect(state.armingState).toBe('disarmed');
      expect(state.currentPersonCount).toBe(0);
      expect(state.armingTimeRemaining).toBe(0);
    });

    it('should have empty intrusion frames', () => {
      const state = useSecurityStore.getState();
      expect(state.intrusionFrames).toEqual([]);
      expect(state.totalIntrusionEvents).toBe(0);
    });
  });

  describe('Arming Actions', () => {
    it('should arm the system', () => {
      useSecurityStore.getState().arm();
      const state = useSecurityStore.getState();
      expect(state.armingState).toBe('arming');
      expect(state.armingTimeRemaining).toBe(DEFAULT_SECURITY_SETTINGS.armingCountdown);
    });

    it('should disarm the system', () => {
      useSecurityStore.getState().arm();
      useSecurityStore.getState().disarm();
      const state = useSecurityStore.getState();
      expect(state.armingState).toBe('disarmed');
      expect(state.armingTimeRemaining).toBe(0);
    });

    it('should set arming state directly', () => {
      useSecurityStore.getState().setArmingState('armed');
      expect(useSecurityStore.getState().armingState).toBe('armed');
    });

    it('should transition to armed when countdown completes', () => {
      useSecurityStore.getState().arm();
      useSecurityStore.getState().setArmingTimeRemaining(0);
      expect(useSecurityStore.getState().armingState).toBe('armed');
    });
  });

  describe('Settings Actions', () => {
    it('should update allowed persons', () => {
      useSecurityStore.getState().setAllowedPersons(3);
      expect(useSecurityStore.getState().settings.allowedPersons).toBe(3);
    });

    it('should update alert mode', () => {
      useSecurityStore.getState().setAlertMode('silent');
      expect(useSecurityStore.getState().settings.alertMode).toBe('silent');
    });

    it('should update alert settings', () => {
      useSecurityStore.getState().updateAlertSettings({ sirenEnabled: false });
      expect(useSecurityStore.getState().settings.alerts.sirenEnabled).toBe(false);
    });

    it('should update TTS settings', () => {
      useSecurityStore.getState().updateTTSSettings({ volume: 0.5 });
      expect(useSecurityStore.getState().settings.alerts.tts.volume).toBe(0.5);
    });

    it('should update general settings', () => {
      useSecurityStore.getState().updateSettings({
        confidenceThreshold: 0.8,
        motionThreshold: 25,
      });
      const state = useSecurityStore.getState();
      expect(state.settings.confidenceThreshold).toBe(0.8);
      expect(state.settings.motionThreshold).toBe(25);
    });
  });

  describe('Detection Actions', () => {
    it('should update current person count', () => {
      useSecurityStore.getState().setCurrentPersonCount(5);
      expect(useSecurityStore.getState().currentPersonCount).toBe(5);
    });

    it('should record detection', () => {
      useSecurityStore.getState().recordDetection(3);
      const state = useSecurityStore.getState();
      expect(state.currentPersonCount).toBe(3);
      expect(state.lastDetectionTime).not.toBeNull();
    });
  });

  describe('Intrusion Triggering', () => {
    it('should trigger intrusion', () => {
      const frame = createMockIntrusionFrame(3, 0);
      useSecurityStore.getState().triggerIntrusion(frame);
      
      const state = useSecurityStore.getState();
      expect(state.armingState).toBe('triggered');
      expect(state.intrusionFrames).toHaveLength(1);
      expect(state.totalIntrusionEvents).toBe(1);
      expect(state.lastIntrusionTime).not.toBeNull();
    });

    it('should respect trigger cooldown', () => {
      const frame1 = createMockIntrusionFrame();
      const frame2 = createMockIntrusionFrame();
      
      useSecurityStore.getState().triggerIntrusion(frame1);
      useSecurityStore.getState().triggerIntrusion(frame2);
      
      // Should still only have 1 frame due to cooldown
      expect(useSecurityStore.getState().intrusionFrames).toHaveLength(1);
    });

    it('should limit stored frames', () => {
      useSecurityStore.getState().updateSettings({ maxStoredFrames: 3 });
      
      for (let i = 0; i < 5; i++) {
        const frame = createMockIntrusionFrame();
        // Bypass cooldown by modifying lastTriggerTime
        useSecurityStore.setState({ lastTriggerTime: null });
        useSecurityStore.getState().triggerIntrusion(frame);
      }
      
      expect(useSecurityStore.getState().intrusionFrames.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Intrusion Frame Management', () => {
    it('should add intrusion frame', () => {
      const frame = createMockIntrusionFrame();
      useSecurityStore.getState().addIntrusionFrame(frame);
      expect(useSecurityStore.getState().intrusionFrames).toHaveLength(1);
    });

    it('should remove intrusion frame', () => {
      const frame = createMockIntrusionFrame();
      useSecurityStore.getState().addIntrusionFrame(frame);
      useSecurityStore.getState().removeIntrusionFrame(frame.id);
      expect(useSecurityStore.getState().intrusionFrames).toHaveLength(0);
    });

    it('should acknowledge frame', () => {
      const frame = createMockIntrusionFrame();
      useSecurityStore.getState().addIntrusionFrame(frame);
      useSecurityStore.getState().acknowledgeFrame(frame.id);
      expect(useSecurityStore.getState().intrusionFrames[0].acknowledged).toBe(true);
    });

    it('should export frames', () => {
      const frame = createMockIntrusionFrame();
      useSecurityStore.getState().addIntrusionFrame(frame);
      useSecurityStore.getState().exportFrames([frame.id]);
      expect(useSecurityStore.getState().intrusionFrames[0].exported).toBe(true);
    });

    it('should update frame notes', () => {
      const frame = createMockIntrusionFrame();
      useSecurityStore.getState().addIntrusionFrame(frame);
      useSecurityStore.getState().updateFrameNotes(frame.id, 'Test note');
      expect(useSecurityStore.getState().intrusionFrames[0].notes).toBe('Test note');
    });

    it('should clear intrusion history', () => {
      const frame = createMockIntrusionFrame();
      useSecurityStore.getState().addIntrusionFrame(frame);
      useSecurityStore.getState().clearIntrusionHistory();
      expect(useSecurityStore.getState().intrusionFrames).toHaveLength(0);
    });
  });

  describe('Custom Messages', () => {
    it('should add custom message', () => {
      useSecurityStore.getState().addCustomMessage('Test warning!');
      expect(useSecurityStore.getState().settings.customMessages).toContain('Test warning!');
    });

    it('should remove custom message', () => {
      useSecurityStore.getState().addCustomMessage('Test warning!');
      useSecurityStore.getState().removeCustomMessage(0);
      expect(useSecurityStore.getState().settings.customMessages).not.toContain('Test warning!');
    });

    it('should set all custom messages', () => {
      const messages = ['Warning 1', 'Warning 2', 'Warning 3'];
      useSecurityStore.getState().setCustomMessages(messages);
      expect(useSecurityStore.getState().settings.customMessages).toEqual(messages);
    });
  });

  describe('Reset', () => {
    it('should reset runtime state', () => {
      useSecurityStore.getState().arm();
      useSecurityStore.getState().setCurrentPersonCount(5);
      useSecurityStore.getState().reset();
      
      const state = useSecurityStore.getState();
      expect(state.armingState).toBe('disarmed');
      expect(state.currentPersonCount).toBe(0);
      expect(state.armingTimeRemaining).toBe(0);
    });
  });
});

describe('Selectors', () => {
  beforeEach(() => {
    useSecurityStore.setState({
      armingState: 'disarmed',
      settings: { ...DEFAULT_SECURITY_SETTINGS },
      currentPersonCount: 0,
      lastDetectionTime: null,
      lastTriggerTime: null,
      armingTimeRemaining: 0,
      intrusionFrames: [],
      totalIntrusionEvents: 0,
      lastIntrusionTime: null,
    });
  });

  describe('selectIsArmed', () => {
    it('should return true when armed', () => {
      useSecurityStore.setState({ armingState: 'armed' });
      expect(selectIsArmed(useSecurityStore.getState())).toBe(true);
    });

    it('should return true when triggered', () => {
      useSecurityStore.setState({ armingState: 'triggered' });
      expect(selectIsArmed(useSecurityStore.getState())).toBe(true);
    });

    it('should return false when disarmed', () => {
      useSecurityStore.setState({ armingState: 'disarmed' });
      expect(selectIsArmed(useSecurityStore.getState())).toBe(false);
    });
  });

  describe('selectIsTriggered', () => {
    it('should return true when triggered', () => {
      useSecurityStore.setState({ armingState: 'triggered' });
      expect(selectIsTriggered(useSecurityStore.getState())).toBe(true);
    });

    it('should return false when armed', () => {
      useSecurityStore.setState({ armingState: 'armed' });
      expect(selectIsTriggered(useSecurityStore.getState())).toBe(false);
    });
  });

  describe('selectPersonExcess', () => {
    it('should calculate excess correctly', () => {
      useSecurityStore.setState({
        currentPersonCount: 5,
        settings: { ...DEFAULT_SECURITY_SETTINGS, allowedPersons: 2 },
      });
      expect(selectPersonExcess(useSecurityStore.getState())).toBe(3);
    });

    it('should return 0 when not exceeded', () => {
      useSecurityStore.setState({
        currentPersonCount: 1,
        settings: { ...DEFAULT_SECURITY_SETTINGS, allowedPersons: 2 },
      });
      expect(selectPersonExcess(useSecurityStore.getState())).toBe(0);
    });
  });

  describe('selectHasExcess', () => {
    it('should return true when exceeded', () => {
      useSecurityStore.setState({
        currentPersonCount: 3,
        settings: { ...DEFAULT_SECURITY_SETTINGS, allowedPersons: 2 },
      });
      expect(selectHasExcess(useSecurityStore.getState())).toBe(true);
    });

    it('should return false when at limit', () => {
      useSecurityStore.setState({
        currentPersonCount: 2,
        settings: { ...DEFAULT_SECURITY_SETTINGS, allowedPersons: 2 },
      });
      expect(selectHasExcess(useSecurityStore.getState())).toBe(false);
    });
  });
});

describe('Helper Functions', () => {
  describe('createIntrusionFrame', () => {
    it('should create frame with all required fields', () => {
      const frame = createIntrusionFrame(
        'data:image/jpeg;base64,mock',
        3,
        1,
        [{ bbox: [10, 20, 100, 200], confidence: 0.95 }]
      );

      expect(frame.id).toBeTruthy();
      expect(frame.frameData).toBe('data:image/jpeg;base64,mock');
      expect(frame.personCount).toBe(3);
      expect(frame.allowedCount).toBe(1);
      expect(frame.detections).toHaveLength(1);
      expect(frame.acknowledged).toBe(false);
      expect(frame.exported).toBe(false);
    });

    it('should generate unique IDs', () => {
      const frame1 = createIntrusionFrame('data:...', 1, 0, []);
      const frame2 = createIntrusionFrame('data:...', 1, 0, []);
      expect(frame1.id).not.toBe(frame2.id);
    });
  });

  describe('getAlertModeLabel', () => {
    it('should return correct labels', () => {
      expect(getAlertModeLabel('extreme')).toContain('Extreme');
      expect(getAlertModeLabel('silent')).toContain('Silent');
    });
  });

  describe('getAlertModeDescription', () => {
    it('should return descriptions', () => {
      expect(getAlertModeDescription('extreme')).toBeTruthy();
      expect(getAlertModeDescription('silent')).toBeTruthy();
    });
  });

  describe('getArmingStateLabel', () => {
    it('should return correct labels', () => {
      expect(getArmingStateLabel('disarmed')).toBe('Disarmed');
      expect(getArmingStateLabel('arming')).toBe('Arming...');
      expect(getArmingStateLabel('armed')).toBe('Armed');
      expect(getArmingStateLabel('triggered')).toBe('Alert');
    });
  });

  describe('getArmingStateColor', () => {
    it('should return correct colors', () => {
      expect(getArmingStateColor('disarmed')).toBe('gray');
      expect(getArmingStateColor('arming')).toBe('yellow');
      expect(getArmingStateColor('armed')).toBe('green');
      expect(getArmingStateColor('triggered')).toBe('red');
    });
  });
});

