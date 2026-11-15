/**
 * Theme Provider
 *
 * Applies theme and accessibility settings to the app.
 * Must be placed inside Providers but before any themed content.
 *
 * @module components/ThemeProvider
 */

'use client';

import React from 'react';
import { useTheme } from '../lib/theme-manager';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Use the theme hook to apply theme classes. The inline script in the root
  // layout sets the look before the first paint, so the page is shown at once:
  // its words are readable before any script runs and when a script fails.
  useTheme();

  return <div suppressHydrationWarning>{children}</div>;
}

export default ThemeProvider;
