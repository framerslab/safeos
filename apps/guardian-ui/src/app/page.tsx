/**
 * SafeOS Guardian - Home Page
 *
 * Marketing-first landing page (SSG/SSR) with a client CTA that adapts for
 * returning users once hydrated.
 *
 * @module app/page
 */
import type { Metadata } from 'next';
import {
  IconShield,
  IconCamera,
  IconBell,
  IconHeart,
  IconWarning,
  IconRadar,
  IconFingerprint,
  IconMic,
  IconWifiOff,
  IconCpu,
  IconChevronDown,
  IconDatabase,
} from '../components/icons';
import { UseCaseShowcase } from '../components/UseCaseShowcase';
import { HomeCTA } from '@/components/home/HomeCTA';
import { DiagramZoomable } from '@/components/DiagramZoomable';
import { NotAMedicalDevice } from '@/components/NotAMedicalDevice';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh').replace(/\/+$/, '');

// The title and description are the root layout's defaults.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

// =============================================================================
// Animated Shield SVG Component
// =============================================================================

function AnimatedShield() {
  return (
    <div className="relative w-24 h-24 md:w-32 md:h-32">
      {/* Outer pulse ring */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
      >
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="rgba(16,185,129,0.2)"
          strokeWidth="1"
          className="animate-[ping_3s_ease-in-out_infinite]"
        />
      </svg>
      
      {/* Secondary pulse */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
      >
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="rgba(16,185,129,0.15)"
          strokeWidth="1"
          className="animate-[ping_3s_ease-in-out_infinite_500ms]"
        />
      </svg>

      {/* Shield body */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        fill="none"
      >
        {/* Shield outline */}
        <path
          d="M50 10 L85 25 L85 50 C85 72 68 88 50 95 C32 88 15 72 15 50 L15 25 Z"
          fill="rgba(16,185,129,0.08)"
          stroke="rgba(16,185,129,0.6)"
          strokeWidth="1.5"
          className="animate-[pulse_4s_ease-in-out_infinite]"
        />
        
        {/* Inner circle - camera eye */}
        <circle
          cx="50"
          cy="50"
          r="15"
          fill="none"
          stroke="rgba(16,185,129,0.8)"
          strokeWidth="2"
        />
        
        {/* Pupil with subtle animation */}
        <circle
          cx="50"
          cy="50"
          r="6"
          fill="rgba(16,185,129,1)"
          className="animate-[pulse_2s_ease-in-out_infinite]"
        />
        
        {/* Scan line animation */}
        <line
          x1="35"
          y1="50"
          x2="65"
          y2="50"
          stroke="rgba(16,185,129,0.4)"
          strokeWidth="1"
          strokeDasharray="4 2"
          className="animate-[pulse_1.5s_ease-in-out_infinite]"
        />
      </svg>
    </div>
  );
}

// =============================================================================
// Landing Page Component
// =============================================================================

function LandingPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'SafeOS Guardian',
    alternateName: ['SafeOS', 'SafeOS Guardian PWA'],
    url: SITE_URL,
    sameAs: [
      'https://github.com/framerslab/safeos',
      'https://frame.dev',
      'https://agentos.sh',
    ],
    applicationCategory: 'SecurityApplication',
    applicationSubCategory: 'BabyMonitor',
    operatingSystem: 'Web (Progressive Web App)',
    browserRequirements: 'Requires JavaScript and a modern browser with WebGL',
    softwareVersion: '1.0',
    license: 'https://opensource.org/license/mit/',
    keywords: 'free baby monitor, open source baby monitor, pet camera no subscription, webcam motion detection, tensorflow.js webcam, on-device computer vision PWA, non-cloud baby monitor',
    description:
      'Free, open-source monitor that runs in your browser: motion and sound alerts for a baby, a pet or an older relative, and person and animal detection with COCO-SSD in Security and Wildlife. Frames stay on your device unless you connect your own server. Built by Frame.',
    featureList: [
      'Motion and pixel-change alerts in the browser',
      'Person and animal detection with COCO-SSD (Security and Wildlife)',
      'Sound-level alerts (Web Audio FFT)',
      'Lost & Found colour matching',
      'Severity-tiered alert escalation',
      'Optional Twilio SMS / Telegram / Resend email fan-out',
      'Optional Ollama LAN bridge for richer scene reasoning',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    publisher: {
      '@type': 'Organization',
      '@id': 'https://frame.dev/#organization',
      name: 'Frame',
      url: 'https://frame.dev',
      sameAs: [
        'https://frame.dev',
        'https://agentos.sh',
        'https://paracosm.agentos.sh',
        'https://github.com/framerslab',
        'https://github.com/framerslab/safeos',
        'https://github.com/framerslab/agentos',
        'https://twitter.com/framedev',
      ],
    },
    isPartOf: {
      '@type': 'WebSite',
      name: 'SafeOS Guardian',
      url: SITE_URL,
    },
  };

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://frame.dev/#organization',
    name: 'Frame',
    alternateName: ['Frame Dev', 'framerslab'],
    url: 'https://frame.dev',
    description:
      'Frame builds local-first, open-source AI runtimes. SafeOS Guardian is the consumer-facing browser monitor. AgentOS is the agent runtime with cognitive memory.',
    sameAs: [
      'https://frame.dev',
      'https://agentos.sh',
      'https://paracosm.agentos.sh',
      'https://github.com/framerslab',
      'https://github.com/framerslab/safeos',
      'https://github.com/framerslab/agentos',
      'https://twitter.com/framedev',
    ],
    knowsAbout: [
      'TensorFlow.js',
      'on-device AI',
      'local-first software',
      'agent runtimes',
      'cognitive memory',
      'browser-based machine learning',
    ],
  };

  return (
    <div className="bg-[var(--color-steel-950)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      {/* Hero Section */}
      <main className="flex flex-col items-center px-6 py-12 md:py-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Animated Shield */}
          <div className="flex justify-center mb-6">
            <AnimatedShield />
          </div>
          
          {/* Title - split style matching nav Logo (SafeOS primary, Guardian secondary) */}
          <h1 className="mb-3 flex flex-col items-center gap-1">
            <span className="text-5xl md:text-6xl font-bold tracking-tight text-[var(--color-steel-100)] leading-none
                             font-[family-name:var(--font-inter)]">
              SafeOS
            </span>
            <span className="text-lg md:text-2xl font-mono uppercase tracking-[0.4em] text-emerald-400/90 leading-none
                             pl-[0.4em]">
              Guardian
            </span>
          </h1>

          <p className="text-xs md:text-sm text-emerald-500 mb-6 tracking-[0.25em] uppercase font-medium">
            Experimental Supplemental Monitoring Tool
          </p>

          {/* Tagline */}
          <p className="text-lg md:text-xl text-[var(--color-steel-200)] mb-8 max-w-2xl mx-auto leading-relaxed">
            A free, lo-tech monitoring aid using standard{' '}
            <span className="text-emerald-400 font-medium">webcams</span> and{' '}
            <span className="text-emerald-400 font-medium">microphones</span>.
            <br />
            <span className="text-[var(--color-steel-300)]">
              Designed for tech-savvy parents or those willing to learn. Portable by design.
            </span>
          </p>

          {/* Critical Disclaimer Box */}
          <div className="max-w-2xl mx-auto mb-8 p-4 bg-amber-500/10 border border-amber-500/40 rounded-lg">
            <div className="flex items-start gap-3">
              <IconWarning size={24} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm text-amber-100 font-semibold mb-1">
                  This is NOT a replacement for human supervision
                </p>
                <p className="text-xs text-amber-100/90 leading-relaxed">
                  SafeOS Guardian is a <strong>supplemental experimental tool</strong> only.
                  It cannot and should not replace direct human care and attention.
                  Technology can fail. Always maintain proper supervision of children,
                  pets, and elderly family members.
                </p>
                <NotAMedicalDevice className="mt-2 text-sm text-amber-100 leading-relaxed" />
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <HomeCTA />

          {/* GitHub CTA - single prominent button */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://github.com/framerslab/safeos"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-emerald-500/30 hover:border-emerald-500/60 rounded-lg transition-colors group"
            >
              <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-slate-100 font-semibold">View on GitHub</span>
              <span className="text-xs text-slate-400 border-l border-slate-600 pl-3">MIT License</span>
            </a>
          </div>

          {/* Ecosystem attribution — keeps Frame + AgentOS visible above the fold for SEO + brand authority */}
          <p className="mt-6 text-xs text-[var(--color-steel-400)] text-center max-w-2xl mx-auto leading-relaxed">
            Built by{' '}
            <a
              href="https://frame.dev"
              target="_blank"
              rel="noopener"
              className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline font-medium"
            >
              Frame
            </a>
            {' '}— the team behind{' '}
            <a
              href="https://agentos.sh"
              target="_blank"
              rel="noopener"
              className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline font-medium"
            >
              AgentOS
            </a>
            , the open-source agent runtime with cognitive memory, and{' '}
            <a
              href="https://paracosm.agentos.sh"
              target="_blank"
              rel="noopener"
              className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline font-medium"
            >
              Paracosm
            </a>
            , an agent swarm simulation engine. Same local-first philosophy.
          </p>
        </div>

        {/* Features Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto w-full">
          <FeatureCard
            icon={IconCamera}
            title="Lo-Tech & Portable"
            description="Uses standard webcams and microphones you already own. No special hardware required."
          />
          <FeatureCard
            icon={IconBell}
            title="Supplemental Alerts"
            description="Get notified as a backup layer—never as your primary supervision method."
          />
          <FeatureCard
            icon={IconShield}
            title="Privacy First"
            description="Monitoring runs in your browser. Nothing is uploaded unless you connect a server you run yourself."
          />
        </div>

        {/* Deep Learning, In Your Browser - Expandable Product Cards */}
        <section className="mt-20 max-w-5xl mx-auto w-full">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
              <IconCpu size={14} className="text-emerald-400" />
              <span className="text-xs uppercase tracking-widest text-emerald-300 font-semibold">
                On-device inference
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[var(--color-steel-100)] mb-3 leading-tight">
              Deep learning, in your browser.
            </h2>
            <p className="text-base md:text-lg text-[var(--color-steel-200)] max-w-2xl mx-auto leading-relaxed">
              Motion, audio, and pixel-change detectors run{' '}
              <span className="text-emerald-400 font-medium">locally</span>. Security and
              Wildlife use COCO-SSD to find people and animals after setup and agreement
              to download the detection model. Tap any card to see how it works.
            </p>
          </div>

          {/* Architecture diagram — click to zoom */}
          <div className="mb-10">
            <DiagramZoomable
              src="/diagrams/how-it-works.svg"
              alt="SafeOS Guardian architecture — browser inference pipeline plus optional API server"
              caption={
                <>
                  The solid path runs in your browser. Offline starts need a completed app installation and a saved detection model.
                  The dashed path engages only when you deploy the optional API server.
                </>
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DeepLearningCard
              icon={IconRadar}
              title="Real-time object detection"
              tag="COCO-SSD · TensorFlow.js"
              size="18.6 MB download"
              summary="Security mode runs COCO-SSD when the frame-difference check sees movement and counts the people in view, at most twice a second. Wildlife mode uses the same model to find animals."
              details={[
                'Runs on TensorFlow.js with the WebGL backend, which uses your graphics chip.',
                'Bounding-box localization plus confidence scoring per class.',
                'The model downloads from Google model storage only after you agree, then stays in your browser\'s Cache Storage.',
                'Security and Wildlife each have a confidence threshold setting.',
              ]}
            />

            <DeepLearningCard
              icon={IconFingerprint}
              title="Visual fingerprinting for Lost & Found"
              tag="Color + edge signatures"
              size="< 1 KB / photo"
              summary="Upload 1–5 reference photos of your pet. The browser records their colours, a coarse edge grid and size, and checks the live feed 1–2 times a second for anything with matching colours. Another animal or an object of similar colour can match too."
              details={[
                '32-bucket color histogram per reference photo.',
                'Top-5 dominant colors via k-means clustering.',
                '8×8 grid of edge strengths, from differences between neighbouring pixels.',
                'Aspect-ratio and size estimates for sanity-check matching.',
                'Each frame is scored on colour first, then region by region: histogram 40%, dominant colours 35%, edges 15%, size 10%. The alert threshold is adjustable (70% by default).',
              ]}
            />

            <DeepLearningCard
              icon={IconMic}
              title="Sound alerts"
              tag="Web Audio API"
              size="No model required"
              summary="An FFT analyzer measures sound levels in the browser and raises an alert when sound stays above your threshold."
              details={[
                'Spectral analysis through the Web Audio API.',
                'Loudness thresholds set per scenario.',
                'A crying pattern shows in the camera overlay; it does not raise an alert on its own.',
                'Volume-ramping escalation: starts quiet, gets louder until you acknowledge.',
              ]}
            />

            <DeepLearningCard
              icon={IconWifiOff}
              title="Offline-first by design"
              tag="PWA · Service worker"
              size="Installed pages and saved model"
              summary="SafeOS installs as a Progressive Web App. Once installation finishes online, exported pages and their scripts are available offline, including pages you have not opened. Security and Wildlife reuse the detection model offline after you agree to download and save it."
              details={[
                'Wait for the app installation and detection model download to finish while online. Clearing or evicting browser storage requires downloading them again.',
                'Settings stay in localStorage; Lost & Found photos and saved frames persist in IndexedDB; monitor alerts persist in IndexedDB and remain in History after acknowledgement.',
                'No origin server required — host the static `out/` folder on GitHub Pages, Netlify, or any CDN.',
                'Optional API server is just that: optional. Only needed for SMS/Telegram fan-out or Ollama LLM bridging.',
              ]}
            />

            <DeepLearningCard
              icon={IconDatabase}
              title="What stays on your device"
              tag="IndexedDB · No telemetry"
              size="Local by default"
              summary="Frames are compared in your browser. Settings, alerts, reference photos and the frames a mode saves stay in your browser's storage."
              details={[
                'The motion check keeps only the last three frames in memory.',
                'No analytics, no third-party trackers, no model-improvement uploads.',
                'Security and Wildlife download the detection model from Google model storage after you agree; Google sees your IP address.',
                'All optional integrations (Twilio SMS, Telegram, Ollama) are opt-in and run server-side only when you choose to deploy them.',
              ]}
            />
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-[var(--color-steel-400)]">
              Verified by reading the source —{' '}
              <a
                href="https://github.com/framerslab/safeos/tree/master/apps/guardian-ui/src/lib"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
              >
                see the client-side inference pipeline on GitHub →
              </a>
            </p>
          </div>
        </section>

        {/* Server Setup Info Box */}
        <div className="mt-16 max-w-3xl mx-auto w-full">
          <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 flex items-center justify-center bg-emerald-500/15 rounded-lg flex-shrink-0">
                <IconShield size={24} className="text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[var(--color-steel-100)] mb-2">
                  Runs without a server
                </h3>
                <p className="text-sm text-[var(--color-steel-200)] leading-relaxed mb-3">
                  <strong className="text-emerald-400">Monitoring needs no server.</strong>{' '}
                  Detection, sound alerts, browser notifications, and storage run in your browser,
                  and your data stays on your device. Email, text, and Telegram alerts need the optional server.
                </p>
                <div className="p-3 bg-slate-900/60 border border-slate-700 rounded-lg mb-3">
                  <p className="text-xs text-[var(--color-steel-300)] mb-2">
                    <strong className="text-blue-300">Optional API server</strong> — only needed for:
                  </p>
                  <ul className="text-xs text-[var(--color-steel-300)] space-y-1 ml-4 list-disc">
                    <li>SMS alerts via Twilio</li>
                    <li>Telegram bot notifications</li>
                    <li>Multi-device sync</li>
                    <li>Ollama local LLM integration</li>
                  </ul>
                </div>
                <a
                  href="https://github.com/framerslab/safeos#option-b-full-stack-advanced"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 rounded-lg transition-colors text-sm"
                >
                  <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  <span className="text-slate-300">View Server Setup Guide on GitHub</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Use Case Showcase */}
        <div className="mt-16 max-w-6xl mx-auto w-full px-4">
          <UseCaseShowcase />
        </div>

        {/* Who builds it, and what is free */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2.5
                          bg-emerald-500/10 border border-emerald-500/20
                          rounded-2xl sm:rounded-full text-emerald-400 max-w-[90vw]">
            <IconHeart size={20} className="text-red-400 flex-shrink-0" />
            <span className="text-sm font-medium">
              Frame builds SafeOS and pays for its development
            </span>
          </div>
          
          <p className="text-sm text-[var(--color-steel-300)] text-center max-w-md">
            <strong className="text-emerald-400">SafeOS at safeos.sh is free.</strong> There is no account,
            no paid tier and no subscription on this site. The code is MIT-licensed, so anyone can run it.
          </p>
        </div>
      </main>
    </div>
  );
}

// =============================================================================
// Feature Card Component
// =============================================================================

interface FeatureCardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="p-5 bg-[var(--color-steel-900)] border border-[var(--color-steel-800)]
                    rounded-lg hover:border-emerald-500/30 transition-colors">
      <div className="w-10 h-10 flex items-center justify-center
                      bg-emerald-500/10 rounded-lg mb-3">
        <Icon size={20} className="text-emerald-500" />
      </div>
      <h3 className="text-base font-semibold text-[var(--color-steel-100)] mb-1">
        {title}
      </h3>
      <p className="text-sm text-[var(--color-steel-300)] leading-relaxed">
        {description}
      </p>
    </div>
  );
}

// =============================================================================
// Deep Learning Card (Expandable) - native <details> for zero-JS expand
// =============================================================================

interface DeepLearningCardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  tag: string;
  size: string;
  summary: string;
  details: string[];
}

function DeepLearningCard({ icon: Icon, title, tag, size, summary, details }: DeepLearningCardProps) {
  return (
    <details className="group p-5 bg-[var(--color-steel-900)] border border-[var(--color-steel-800)]
                        rounded-xl hover:border-emerald-500/40 transition-colors
                        [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none flex items-start gap-4">
        <div className="w-11 h-11 flex items-center justify-center bg-emerald-500/10 rounded-lg flex-shrink-0
                        group-hover:bg-emerald-500/15 transition-colors">
          <Icon size={22} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-base font-semibold text-[var(--color-steel-100)] leading-tight">
              {title}
            </h3>
            <IconChevronDown
              size={18}
              className="text-[var(--color-steel-400)] flex-shrink-0 mt-0.5
                         transition-transform group-open:rotate-180"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider font-mono text-emerald-400/90
                             bg-emerald-500/5 border border-emerald-500/20 px-2 py-0.5 rounded">
              {tag}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--color-steel-400)]
                             bg-[var(--color-steel-800)]/50 border border-[var(--color-steel-800)] px-2 py-0.5 rounded">
              {size}
            </span>
          </div>
          <p className="text-sm text-[var(--color-steel-200)] leading-relaxed">
            {summary}
          </p>
        </div>
      </summary>

      <div className="mt-4 ml-[60px] pt-4 border-t border-[var(--color-steel-800)]">
        <ul className="space-y-2">
          {details.map((detail, idx) => (
            <li key={idx} className="text-sm text-[var(--color-steel-300)] leading-relaxed flex items-start gap-2">
              <span className="text-emerald-400 mt-1.5 flex-shrink-0">▸</span>
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function HomePage() {
  return <LandingPage />;
}
