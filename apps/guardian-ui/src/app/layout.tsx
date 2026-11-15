/**
 * Root Layout
 *
 * Root layout for the SafeOS Guardian UI.
 * Industrial, utilitarian design system.
 *
 * @module app/layout
 */

import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { SiteShell } from '@/components/layout';
import { Providers } from '@/components/Providers';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { KeyboardShortcutsProvider } from '@/components/KeyboardShortcutsProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { HOME_DESCRIPTION, HOME_FULL_TITLE, socialImage } from '@/lib/page-metadata';
import { LOOK_PAGE_COLOURS } from '@/lib/look-colours';
import './globals.css';

// =============================================================================
// Fonts - Industrial Typography System
// =============================================================================

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

// =============================================================================
// Metadata
// =============================================================================

// The defaults for a page that sets no metadata of its own. Every public page
// sets its title, description, canonical address and cards through
// lib/page-metadata, the home page included.
const SOCIAL_IMAGE = socialImage();

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh'),
  title: {
    default: HOME_FULL_TITLE,
    template: '%s | SafeOS Guardian',
  },
  description: HOME_DESCRIPTION,
  authors: [{ name: 'Frame', url: 'https://frame.dev' }],
  creator: 'Frame',
  publisher: 'Frame',

  // Icons
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/safari-pinned-tab.svg', color: '#22C55E' },
    ],
  },

  // PWA Manifest
  manifest: '/manifest.json',

  // Open Graph
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://safeos.sh',
    siteName: 'SafeOS Guardian',
    title: HOME_FULL_TITLE,
    description: HOME_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },

  // X card
  twitter: {
    card: 'summary_large_image',
    title: HOME_FULL_TITLE,
    description: HOME_DESCRIPTION,
    images: [{ url: SOCIAL_IMAGE.url, alt: SOCIAL_IMAGE.alt }],
    creator: '@framerslab',
  },

  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

// The browser's own bar takes the page colour of the look: the device's
// setting on a first visit, and the chosen look after a press of the switch
// (lib/theme-manager sets it then).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: LOOK_PAGE_COLOURS.dark },
    { media: '(prefers-color-scheme: light)', color: LOOK_PAGE_COLOURS.light },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  colorScheme: 'dark light',
};

// =============================================================================
// Layout
// =============================================================================

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Favicon with dark/light mode support */}
        <link
          rel="icon"
          href="/favicon.svg"
          type="image/svg+xml"
          media="(prefers-color-scheme: dark)"
        />
        <link
          rel="icon"
          href="/favicon-light.svg"
          type="image/svg+xml"
          media="(prefers-color-scheme: light)"
        />

        {/* Theme initialization script - prevents flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('guardian-theme');
                  var parsed = stored ? JSON.parse(stored) : null;
                  var state = parsed && parsed.state ? parsed.state : null;
                  var mode = state && state.themeMode ? state.themeMode : 'system';
                  var accessibility = state && state.accessibility ? state.accessibility : {};

                  var theme = mode;
                  if (mode === 'system') {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }

                  document.documentElement.classList.add(theme);
                  document.documentElement.style.colorScheme = theme;

                  if (accessibility.reducedMotion) document.documentElement.classList.add('reduce-motion');
                  if (accessibility.highContrast) document.documentElement.classList.add('high-contrast');
                  if (accessibility.largeText) document.documentElement.classList.add('large-text');
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="app-layout">
        <Providers>
          <ErrorBoundary>
            <ThemeProvider>
              <KeyboardShortcutsProvider>
                <SiteShell>{children}</SiteShell>
              </KeyboardShortcutsProvider>
            </ThemeProvider>
          </ErrorBoundary>
        </Providers>

        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(e) {
                    console.log('ServiceWorker registration failed: ', e);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
