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
import { Nav, Footer, MobileBottomNav } from '@/components/layout';
import { Providers } from '@/components/Providers';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { NotificationPermission } from '@/components/NotificationPermission';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { KeyboardShortcutsProvider } from '@/components/KeyboardShortcutsProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { StatusBanner } from '@/components/StatusBanner';
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh'),
  title: {
    default: 'SafeOS Guardian: Free Baby, Pet and Home Monitor in Your Browser',
    template: '%s | SafeOS Guardian',
  },
  description:
    'Free, open-source monitor that runs in your browser. Motion and sound alerts for a baby, a pet or an older relative on a camera you already own. No account, no subscription. By Frame.',
  keywords: [
    // Primary consumer-intent
    'free baby monitor app',
    'open source baby monitor',
    'baby monitor no subscription',
    'pet camera no subscription',
    'non-cloud baby monitor',
    'baby monitor no WiFi',
    'privacy first baby monitor',
    // Primary dev-intent
    'browser AI monitoring',
    'tensorflow.js webcam',
    'on-device computer vision PWA',
    'COCO-SSD browser',
    'local-first ML',
    'self-hosted baby monitor',
    // Product + ecosystem
    'SafeOS Guardian',
    'Frame',
    'AgentOS',
    'Ollama',
    'home security PWA',
  ],
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
    title: 'SafeOS Guardian: Free Baby, Pet and Home Monitor in Your Browser',
    description: 'Free, open-source monitor that runs in your browser. Motion and sound alerts for a baby, a pet or an older relative on a camera you already own. No account, no subscription. By Frame.',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'SafeOS Guardian: free, open-source monitor that runs in your browser, by Frame',
        type: 'image/svg+xml',
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'SafeOS Guardian: Free Baby, Pet and Home Monitor in Your Browser',
    description: 'Motion and sound alerts in your browser on a camera you already own. Free, open source, no account. By Frame.',
    images: ['/og-image.svg'],
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
  
  // Verification (add your IDs when ready)
  // verification: {
  //   google: 'your-google-verification-id',
  // },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0c0f' },
    { media: '(prefers-color-scheme: light)', color: '#f4f5f6' },
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
                <a href="#main-content" className="sr-only sr-only-focusable">
                  Skip to content
                </a>
                <Nav />
                <div id="main-content" className="app-content">
                  {/* Rendered here (not in Providers) so it sits *below* the
                      fixed nav, not behind it. */}
                  <StatusBanner />
                  {children}
                </div>
                <Footer />

                {/* Mobile Bottom Navigation */}
                <MobileBottomNav />

                {/* PWA Install Prompt */}
                <PWAInstallPrompt />

                {/* Notification Permission Request */}
                <NotificationPermission />
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
