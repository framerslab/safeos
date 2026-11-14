/**
 * Theme & Accessibility Manager
 *
 * Manages theme preferences (light/dark) and accessibility settings.
 * Respects system preferences and allows user overrides.
 *
 * @module lib/theme-manager
 */

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEffect, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ThemeMode = 'light' | 'dark' | 'system';
export type ContrastMode = 'normal' | 'high';

export interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  screenReaderOptimized: boolean;
}

export interface ThemeState {
  // Theme settings
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';

  // Accessibility
  accessibility: AccessibilitySettings;

  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  updateAccessibility: (settings: Partial<AccessibilitySettings>) => void;
  resetAccessibility: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  reducedMotion: false,
  highContrast: false,
  largeText: false,
  screenReaderOptimized: false,
};

// =============================================================================
// Store
// =============================================================================

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeMode: 'system',
      resolvedTheme: 'dark',
      accessibility: { ...DEFAULT_ACCESSIBILITY },

      setThemeMode: (mode) => {
        const resolved = mode === 'system'
          ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : mode;

        set({ themeMode: mode, resolvedTheme: resolved });
      },

      toggleTheme: () => {
        const { themeMode, resolvedTheme } = get();
        if (themeMode === 'system') {
          // If system, switch to opposite of current resolved
          set({
            themeMode: resolvedTheme === 'dark' ? 'light' : 'dark',
            resolvedTheme: resolvedTheme === 'dark' ? 'light' : 'dark',
          });
        } else {
          // Toggle between light and dark
          const newTheme = themeMode === 'dark' ? 'light' : 'dark';
          set({ themeMode: newTheme, resolvedTheme: newTheme });
        }
      },

      updateAccessibility: (settings) => {
        set((state) => ({
          accessibility: { ...state.accessibility, ...settings },
        }));
      },

      resetAccessibility: () => {
        set({ accessibility: { ...DEFAULT_ACCESSIBILITY } });
      },
    }),
    {
      name: 'guardian-theme',
      storage: createJSONStorage(() => localStorage),
      // Persist resolvedTheme alongside themeMode so it's correct on first
      // render after reload. Without this, partialize would drop resolvedTheme
      // and useTheme's effect would race the inline init script in layout.tsx,
      // overwriting the correct class with the default 'dark' before merge
      // gets a chance to recalculate.
      partialize: (state) => ({
        themeMode: state.themeMode,
        resolvedTheme: state.resolvedTheme,
        accessibility: state.accessibility,
      }),
      // For 'system' mode, the persisted resolvedTheme may be stale if the
      // user's OS preference changed since last visit, and on a first visit
      // it is the 'dark' default. Recalculate it from the live media query
      // while merging. This runs inside create() with localStorage, before
      // useThemeStore exists, so it must not call useThemeStore: a call there
      // threw, the store never finished hydrating, and the theme button on a
      // light device changed its icon but not the page.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<ThemeState> | undefined) };
        if (typeof window !== 'undefined' && merged.themeMode === 'system') {
          merged.resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return merged;
      },
    }
  )
);

// =============================================================================
// Hook for applying theme to document
// =============================================================================

export function useTheme() {
  const { themeMode, resolvedTheme, setThemeMode, toggleTheme, accessibility } = useThemeStore();

  // Apply theme to document. Guarded on persist rehydration so the inline
  // init script in layout.tsx (which runs before React) isn't overwritten by
  // a default state value before localStorage has been read.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!useThemeStore.persist.hasHydrated()) return;

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  // Apply accessibility settings
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;

    // Reduced motion
    if (accessibility.reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    // High contrast
    if (accessibility.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Large text
    if (accessibility.largeText) {
      root.classList.add('large-text');
    } else {
      root.classList.remove('large-text');
    }
  }, [accessibility]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (themeMode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      useThemeStore.setState({ resolvedTheme: e.matches ? 'dark' : 'light' });
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  // Check for system reduced motion preference
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Only auto-apply if user hasn't set a preference
    if (mediaQuery.matches && !accessibility.reducedMotion) {
      // Could auto-enable, but we'll respect user choice
    }
  }, [accessibility.reducedMotion]);

  return {
    theme: resolvedTheme,
    themeMode,
    setThemeMode,
    toggleTheme,
    isDark: resolvedTheme === 'dark',
    isLight: resolvedTheme === 'light',
    isSystem: themeMode === 'system',
  };
}

// =============================================================================
// Hook for accessibility settings
// =============================================================================

export function useAccessibility() {
  const { accessibility, updateAccessibility, resetAccessibility } = useThemeStore();

  const toggleReducedMotion = useCallback(() => {
    updateAccessibility({ reducedMotion: !accessibility.reducedMotion });
  }, [accessibility.reducedMotion, updateAccessibility]);

  const toggleHighContrast = useCallback(() => {
    updateAccessibility({ highContrast: !accessibility.highContrast });
  }, [accessibility.highContrast, updateAccessibility]);

  const toggleLargeText = useCallback(() => {
    updateAccessibility({ largeText: !accessibility.largeText });
  }, [accessibility.largeText, updateAccessibility]);

  return {
    ...accessibility,
    updateAccessibility,
    resetAccessibility,
    toggleReducedMotion,
    toggleHighContrast,
    toggleLargeText,
  };
}
