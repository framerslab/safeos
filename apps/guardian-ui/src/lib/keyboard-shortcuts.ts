/**
 * Keyboard Shortcuts Manager
 *
 * Provides global keyboard shortcuts for power users.
 * Press '?' to show help modal with all shortcuts.
 *
 * @module lib/keyboard-shortcuts
 */

'use client';

import { useEffect, useCallback, useState } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface KeyboardShortcut {
  key: string;
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
  description: string;
  category: 'monitoring' | 'navigation' | 'audio' | 'settings' | 'general';
  action: () => void;
}

export interface ShortcutGroup {
  category: string;
  shortcuts: Omit<KeyboardShortcut, 'action'>[];
}

// =============================================================================
// Default Shortcuts Configuration
// =============================================================================

export const SHORTCUT_CATEGORIES = {
  monitoring: { label: 'Monitoring', icon: 'video' },
  navigation: { label: 'Navigation', icon: 'compass' },
  audio: { label: 'Audio', icon: 'volume-2' },
  settings: { label: 'Settings', icon: 'settings' },
  general: { label: 'General', icon: 'keyboard' },
} as const;

export const DEFAULT_SHORTCUTS: Omit<KeyboardShortcut, 'action'>[] = [
  // Monitoring
  { key: 'Space', description: 'Pause/Resume monitoring', category: 'monitoring' },
  { key: 'e', description: 'Toggle emergency mode', category: 'monitoring' },
  { key: 'r', description: 'Reset detection counters', category: 'monitoring' },
  { key: 'f', description: 'Toggle fullscreen video', category: 'monitoring' },
  { key: 'z', description: 'Toggle zone editor', category: 'monitoring' },

  // Navigation
  { key: 'g', modifiers: ['shift'], description: 'Go to Dashboard', category: 'navigation' },
  { key: 'm', modifiers: ['shift'], description: 'Go to Monitor', category: 'navigation' },
  { key: 's', modifiers: ['shift'], description: 'Go to Settings', category: 'navigation' },
  { key: 'h', modifiers: ['shift'], description: 'Go to History', category: 'navigation' },

  // Audio
  { key: 'm', description: 'Toggle mute', category: 'audio' },
  { key: 'ArrowUp', modifiers: ['shift'], description: 'Volume up', category: 'audio' },
  { key: 'ArrowDown', modifiers: ['shift'], description: 'Volume down', category: 'audio' },
  { key: 't', description: 'Test alert sound', category: 'audio' },

  // Settings
  { key: ',', modifiers: ['ctrl'], description: 'Open settings', category: 'settings' },
  { key: '1', description: 'Quick preset: Low sensitivity', category: 'settings' },
  { key: '2', description: 'Quick preset: Medium sensitivity', category: 'settings' },
  { key: '3', description: 'Quick preset: High sensitivity', category: 'settings' },

  // General
  { key: '?', description: 'Show keyboard shortcuts', category: 'general' },
  { key: 'Escape', description: 'Close modal / Cancel action', category: 'general' },
];

// =============================================================================
// Keyboard Manager Class
// =============================================================================

class KeyboardManager {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private enabled: boolean = true;
  private listeners: Set<(e: KeyboardEvent) => void> = new Set();

  /**
   * Generate a unique key for the shortcut
   */
  private getShortcutKey(key: string, modifiers?: string[]): string {
    const mods = modifiers?.sort().join('+') || '';
    return mods ? `${mods}+${key.toLowerCase()}` : key.toLowerCase();
  }

  /**
   * Register a keyboard shortcut
   */
  register(shortcut: KeyboardShortcut): () => void {
    const key = this.getShortcutKey(shortcut.key, shortcut.modifiers);
    this.shortcuts.set(key, shortcut);

    return () => {
      this.shortcuts.delete(key);
    };
  }

  /**
   * Register multiple shortcuts at once
   */
  registerAll(shortcuts: KeyboardShortcut[]): () => void {
    const unregisterFns = shortcuts.map(s => this.register(s));
    return () => unregisterFns.forEach(fn => fn());
  }

  /**
   * Handle keyboard event
   */
  handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    // Preserve activation and widget navigation without blocking unrelated shortcuts.
    const control = target.closest?.('button, a[href], [role="button"], [role="switch"], [role="checkbox"], [role="menuitem"], [role="slider"]');
    if (control && (e.key === ' ' || e.key === 'Enter')) return;
    if (control?.matches('[role="slider"], [role="menuitem"]') &&
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      // Allow Escape to blur inputs
      if (e.key === 'Escape') {
        target.blur();
      }
      return;
    }

    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push('ctrl');
    if (e.altKey) modifiers.push('alt');
    if (e.shiftKey) modifiers.push('shift');
    if (e.metaKey) modifiers.push('meta');

    const key = this.getShortcutKey(e.key, modifiers);
    const shortcut = this.shortcuts.get(key);

    if (shortcut) {
      e.preventDefault();
      shortcut.action();
    }
  }

  /**
   * Enable/disable shortcuts globally
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if shortcuts are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get all registered shortcuts grouped by category
   */
  getShortcutGroups(): ShortcutGroup[] {
    const groups: Map<string, Omit<KeyboardShortcut, 'action'>[]> = new Map();

    this.shortcuts.forEach((shortcut) => {
      const category = shortcut.category;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push({
        key: shortcut.key,
        modifiers: shortcut.modifiers,
        description: shortcut.description,
        category: shortcut.category,
      });
    });

    return Array.from(groups.entries()).map(([category, shortcuts]) => ({
      category,
      shortcuts,
    }));
  }
}

// Singleton instance
export const keyboardManager = new KeyboardManager();

// =============================================================================
// React Hook
// =============================================================================

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const unregister = keyboardManager.registerAll(shortcuts);

    const handleKeyDown = (e: KeyboardEvent) => {
      keyboardManager.handleKeyDown(e);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unregister();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled]);
}

/**
 * Hook for showing/hiding the shortcuts help modal
 */
export function useShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  // Register the '?' shortcut to open help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        toggle();
      }

      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle, close, isOpen]);

  return { isOpen, open, close, toggle };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a shortcut key for display
 */
export function formatShortcutKey(key: string, modifiers?: string[]): string {
  const isMac = typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const modifierSymbols: Record<string, string> = isMac
    ? { ctrl: '⌃', alt: '⌥', shift: '⇧', meta: '⌘' }
    : { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' };

  const parts: string[] = [];

  if (modifiers) {
    modifiers.forEach(mod => {
      parts.push(modifierSymbols[mod] || mod);
    });
  }

  // Format special keys
  const keyDisplay: Record<string, string> = {
    ' ': 'Space',
    'Space': 'Space',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Escape': 'Esc',
    'Enter': '↵',
    'Backspace': '⌫',
    'Delete': 'Del',
    'Tab': '⇥',
  };

  parts.push(keyDisplay[key] || key.toUpperCase());

  return isMac ? parts.join('') : parts.join(' + ');
}
