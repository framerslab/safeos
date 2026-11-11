/**
 * Alert Escalation Unit Tests
 *
 * Tests for the volume-ramping escalation system.
 *
 * @module tests/unit/alert-escalation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AlertEscalationManager,
} from '../../src/lib/alerts/escalation.js';

// =============================================================================
// Test Suite
// =============================================================================

describe('AlertEscalationManager', () => {
  let manager: AlertEscalationManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new AlertEscalationManager();
  });

  afterEach(() => {
    manager.clearAll();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Starting Level Tests
  // ===========================================================================

  describe('starting levels', () => {
    it('should start low severity at level 1', () => {
      manager.startAlert('alert-1', 'stream-1', 'low');
      expect(manager.getAlertLevel('alert-1')).toBe(1);
    });

    it('should start medium severity at level 2', () => {
      manager.startAlert('alert-1', 'stream-1', 'medium');
      expect(manager.getAlertLevel('alert-1')).toBe(2);
    });

    it('should start high severity at level 3', () => {
      manager.startAlert('alert-1', 'stream-1', 'high');
      expect(manager.getAlertLevel('alert-1')).toBe(3);
    });

    it('should start critical severity at level 4', () => {
      manager.startAlert('alert-1', 'stream-1', 'critical');
      expect(manager.getAlertLevel('alert-1')).toBe(4);
    });
  });

  // ===========================================================================
  // Alert Start Tests
  // ===========================================================================

  describe('startAlert', () => {
    it('should start an alert at the correct level', () => {
      manager.startAlert('alert-1', 'stream-1', 'medium');

      const level = manager.getAlertLevel('alert-1');

      expect(level).toBe(2);
    });

    it('should track multiple alerts independently', () => {
      manager.startAlert('alert-1', 'stream-1', 'low');
      manager.startAlert('alert-2', 'stream-1', 'critical');

      expect(manager.getAlertLevel('alert-1')).toBe(1);
      expect(manager.getAlertLevel('alert-2')).toBe(4);
    });

    it('should return escalation object', () => {
      const escalation = manager.startAlert('alert-1', 'stream-1', 'medium');

      expect(escalation.alertId).toBe('alert-1');
      expect(escalation.streamId).toBe('stream-1');
      expect(escalation.severity).toBe('medium');
      expect(escalation.acknowledged).toBe(false);
    });
  });

  // ===========================================================================
  // Volume Tests
  // ===========================================================================

  describe('getVolume', () => {
    it('should return correct volume for level 1', () => {
      manager.startAlert('alert-1', 'stream-1', 'low');
      const volume = manager.getVolume('alert-1');
      expect(volume).toBe(0.3);
    });

    it('should return fallback volume for unknown alert', () => {
      // Implementation returns 0.3 as fallback
      expect(manager.getVolume('unknown')).toBe(0.3);
    });
  });

  // ===========================================================================
  // Sound Tests
  // ===========================================================================

  describe('getSound', () => {
    it('should return correct sound for level 1', () => {
      manager.startAlert('test-alert', 'stream-1', 'low');

      const sound = manager.getSound('test-alert');

      expect(sound).toBe('notification');
    });

    it('should return fallback sound for unknown alert', () => {
      // Implementation returns 'notification' as fallback
      expect(manager.getSound('unknown')).toBe('notification');
    });
  });

  // ===========================================================================
  // Escalation Tests
  // ===========================================================================

  describe('escalation over time', () => {
    it('should escalate based on elapsed time', () => {
      manager.startAlert('test-alert', 'stream-1', 'low');
      expect(manager.getAlertLevel('test-alert')).toBe(1);

      // Fast forward past level 2 delay (30 seconds)
      vi.advanceTimersByTime(35000);

      expect(manager.getAlertLevel('test-alert')).toBe(2);
    });

    it('should continue escalating through levels', () => {
      manager.startAlert('test-alert', 'stream-1', 'low');

      // Fast forward past all levels (3+ minutes)
      vi.advanceTimersByTime(200000);

      // Should be at max level 5
      expect(manager.getAlertLevel('test-alert')).toBe(5);
    });

    it('should not exceed maximum level 5', () => {
      manager.startAlert('test-alert', 'stream-1', 'critical');

      // Fast forward a lot
      vi.advanceTimersByTime(1000000);

      expect(manager.getAlertLevel('test-alert')).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // Acknowledge Tests
  // ===========================================================================

  describe('acknowledgeAlert', () => {
    it('should stop escalation when acknowledged', () => {
      manager.startAlert('test-alert', 'stream-1', 'medium');

      const acknowledged = manager.acknowledgeAlert('test-alert');

      expect(acknowledged).toBe(true);
      const escalation = manager.getEscalation('test-alert');
      expect(escalation?.acknowledged).toBe(true);
    });

    it('should return false for unknown alert', () => {
      const acknowledged = manager.acknowledgeAlert('unknown');

      expect(acknowledged).toBe(false);
    });

    it('should not escalate after acknowledge', () => {
      manager.startAlert('test-alert', 'stream-1', 'low');
      const levelBeforeAck = manager.getAlertLevel('test-alert');
      manager.acknowledgeAlert('test-alert');

      // Fast forward - should not escalate
      vi.advanceTimersByTime(1000000);

      expect(manager.getAlertLevel('test-alert')).toBe(levelBeforeAck);
    });
  });

  // ===========================================================================
  // Active Alert Tests
  // ===========================================================================

  describe('active alerts', () => {
    it('should list all active alerts', () => {
      manager.startAlert('alert-1', 'stream-1', 'low');
      manager.startAlert('alert-2', 'stream-1', 'high');
      manager.startAlert('alert-3', 'stream-1', 'medium');

      const active = manager.getActiveAlerts();

      expect(active).toHaveLength(3);
      expect(active.map(a => a.alertId).sort()).toEqual(['alert-1', 'alert-2', 'alert-3']);
    });

    it('should not include acknowledged alerts', () => {
      manager.startAlert('alert-1', 'stream-1', 'low');
      manager.startAlert('alert-2', 'stream-1', 'high');
      manager.acknowledgeAlert('alert-1');

      const active = manager.getActiveAlerts();

      expect(active).toHaveLength(1);
      expect(active[0].alertId).toBe('alert-2');
    });
  });

  // ===========================================================================
  // Cleanup Tests
  // ===========================================================================

  describe('cleanup', () => {
    it('should clear all alerts on clearAll', () => {
      manager.startAlert('alert-1', 'stream-1', 'low');
      manager.startAlert('alert-2', 'stream-1', 'high');

      manager.clearAll();

      expect(manager.getActiveAlerts()).toHaveLength(0);
    });

    it('should clear individual alert', () => {
      manager.startAlert('alert-1', 'stream-1', 'low');
      manager.startAlert('alert-2', 'stream-1', 'high');

      manager.clearAlert('alert-1');

      const active = manager.getActiveAlerts();
      expect(active).toHaveLength(1);
      expect(active[0].alertId).toBe('alert-2');
    });
  });
});
