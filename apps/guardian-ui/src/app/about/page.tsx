/**
 * About Page
 * 
 * Mission statement, project info, and contact details.
 * 
 * @module app/about/page
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  IconChevronLeft,
  IconShield,
  IconHeart,
  IconGlobe,
  IconDatabase,
  IconExternalLink,
  IconCamera,
  IconCpu,
  IconBell,
  IconWifiOff,
  IconWarning,
} from '../../components/icons';

export const metadata: Metadata = {
  title: 'About',
  description: 'Mission, values, and architecture for SafeOS Guardian.',
};

// =============================================================================
// Components
// =============================================================================

function ValueCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-slate-800/50 border border-slate-700 rounded-xl">
      <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function TeamMember({
  name,
  role,
  avatar,
}: {
  name: string;
  role: string;
  avatar: string;
}) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 mx-auto mb-3 flex items-center justify-center text-3xl">
        {avatar}
      </div>
      <h4 className="font-medium text-white">{name}</h4>
      <p className="text-sm text-slate-400">{role}</p>
    </div>
  );
}

function TechStackItem({
  name,
  description,
  logo,
}: {
  name: string;
  description: string;
  logo: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:border-emerald-500/50 transition-colors">
      <div className="w-12 h-12 relative">
        <Image
          src={`/logos/${logo}`}
          alt={name}
          width={48}
          height={48}
          className="object-contain"
        />
      </div>
      <span className="text-sm font-medium text-white">{name}</span>
      <span className="text-xs text-slate-400 text-center">{description}</span>
    </div>
  );
}

function ArchitectureStep({
  step,
  icon,
  title,
  description,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
        {step}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-7 h-7 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-300">
            {icon}
          </span>
          <h4 className="font-medium text-white">{title}</h4>
        </div>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-slate-400 hover:text-white"
              >
                <IconChevronLeft size={20} />
                <span className="hidden sm:inline">Back</span>
              </Link>
              <div className="flex items-center gap-2">
                <IconShield size={22} className="text-emerald-400" />
                <h1 className="text-xl font-bold text-white">About SafeOS</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-block mb-6">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center">
              <IconShield size={48} className="text-emerald-400" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">
            SafeOS Guardian
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            A humanitarian tool for protecting what matters most—your loved ones, pets, and home.
          </p>
        </div>

        {/* Mission */}
        <section className="mb-16">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-400">01</span>
            Our Mission
          </h3>
          <div className="p-6 bg-slate-900 border border-slate-700 rounded-xl">
            <p className="text-slate-300 leading-relaxed mb-4">
              SafeOS Guardian was created with a singular purpose: to provide accessible, privacy-respecting
              monitoring tools for families worldwide. We believe everyone deserves peace of mind when it
              comes to the safety of their loved ones.
            </p>
            <p className="text-slate-300 leading-relaxed mb-4">
              On safeos.sh, SafeOS runs entirely in your browser. Your recordings, settings, and personal
              information stay on your device. If you connect a server you run yourself, camera frames and
              alerts go to that server. If you also give that server a key for a cloud AI provider, it can
              send a frame to that provider when its local analysis is unavailable.
            </p>
            <p className="text-slate-400 leading-relaxed">
              <strong className="text-emerald-400">Important:</strong> SafeOS Guardian is a supplemental,
              experimental tool for educated parents and caregivers. It is not a replacement for human
              supervision. Always maintain direct oversight of those in your care.
            </p>
          </div>
        </section>

        {/* Values */}
        <section className="mb-16">
          <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <span className="text-emerald-400">02</span>
            Our Values
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ValueCard
              icon={<IconDatabase size={24} />}
              title="Privacy First"
              description="All data stays on your device. We never collect, store, or sell your personal information. Your privacy is non-negotiable."
            />
            <ValueCard
              icon={<IconShield size={24} />}
              title="Open & Transparent"
              description="Our code is open source. Anyone can inspect, audit, and contribute to the project. Transparency builds trust."
            />
            <ValueCard
              icon={<IconHeart size={24} />}
              title="Humanitarian Purpose"
              description="Frame puts some of its development resources into humanitarian work, and SafeOS is part of that work. It is free to use."
            />
            <ValueCard
              icon={<IconGlobe size={24} />}
              title="Accessible Globally"
              description="SafeOS runs in any current browser with a camera, with nothing to install and no account to create."
            />
          </div>
        </section>

        {/* Humanitarian work */}
        <section className="mb-16">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-400">03</span>
            Humanitarian Work
          </h3>
          <div className="p-6 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <IconHeart size={24} className="text-emerald-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Why SafeOS exists</h4>
                <p className="text-sm text-slate-400">Development time given to humanitarian work</p>
              </div>
            </div>
            <p className="text-slate-300 leading-relaxed mb-4">
              Frame puts some of its development resources into humanitarian work, and SafeOS is
              part of that work: a free monitoring tool for families, pets, and the people who care
              for them.
            </p>
            <p className="text-sm text-slate-400">
              A sponsorship on GitHub supports that development. It is not a tax-deductible donation.
            </p>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="mb-16">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-400">04</span>
            Tech Stack
          </h3>
          <p className="text-slate-400 mb-6">
            SafeOS Guardian is built with cutting-edge, production-ready technologies:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <TechStackItem
              name="Next.js 14"
              description="React framework"
              logo="nextjs.svg"
            />
            <TechStackItem
              name="React 18"
              description="UI library"
              logo="react.svg"
            />
            <TechStackItem
              name="TypeScript"
              description="Type safety"
              logo="typescript.svg"
            />
            <TechStackItem
              name="TensorFlow.js"
              description="On-device ML"
              logo="tensorflow.svg"
            />
            <TechStackItem
              name="Zustand"
              description="State management"
              logo="zustand.svg"
            />
            <TechStackItem
              name="Tailwind CSS"
              description="Styling"
              logo="tailwind.svg"
            />
            <TechStackItem
              name="IndexedDB"
              description="Local storage"
              logo="indexeddb.svg"
            />
            <TechStackItem
              name="Capacitor"
              description="Mobile apps"
              logo="capacitor.svg"
            />
          </div>
          <div className="mt-6 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
            <p className="text-sm text-slate-400">
              <span className="text-emerald-400 font-medium">100% Browser-Based:</span>{' '}
              All ML inference runs locally using TensorFlow.js. No data ever leaves your device
              unless you explicitly enable optional cloud features.
            </p>
          </div>
        </section>

        {/* Architecture */}
        <section className="mb-16">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-400">05</span>
            How It Works
          </h3>
          <div className="p-6 bg-slate-900 border border-slate-700 rounded-xl">
            <p className="text-slate-300 leading-relaxed mb-6">
              SafeOS Guardian uses a local-first architecture that keeps your data private while
              delivering powerful AI-driven monitoring:
            </p>
            <div className="space-y-6">
              <ArchitectureStep
                step={1}
                icon={<IconCamera size={16} />}
                title="Camera & Microphone Access"
                description="Your browser requests permission to access your device's camera and microphone. Video and audio streams never leave your device."
              />
              <ArchitectureStep
                step={2}
                icon={<IconCpu size={16} />}
                title="Local AI Processing"
                description="TensorFlow.js analyzes frames in real-time directly in your browser. Motion detection, cry analysis, and pixel monitoring all happen on your device."
              />
              <ArchitectureStep
                step={3}
                icon={<IconBell size={16} />}
                title="Instant Alerts"
                description="When motion or sound is detected, you receive immediate browser notifications and audio alerts. No server round-trip delay."
              />
              <ArchitectureStep
                step={4}
                icon={<IconDatabase size={16} />}
                title="Local Storage"
                description="Settings are kept in your browser's localStorage, and saved frames and reference photos in IndexedDB, all on your device."
              />
              <ArchitectureStep
                step={5}
                icon={<IconWifiOff size={16} />}
                title="Optional Cloud Sync"
                description="If enabled, only encrypted metadata syncs across your devices. Video and audio data always stays local."
              />
            </div>
            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <p className="text-sm text-emerald-300 font-medium">
                Privacy by Design: Even we can&apos;t see your camera feed or hear your audio.
              </p>
            </div>
          </div>
        </section>

        {/* Abuse Policy */}
        <section className="mb-16">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-400">06</span>
            Abuse Prevention
          </h3>
          <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-slate-300 leading-relaxed mb-4">
              SafeOS Guardian is designed for legitimate monitoring purposes only. We actively discourage
              and track potential abuse of this technology:
            </p>
            <ul className="space-y-2 text-slate-400 mb-4">
              <li className="flex items-start gap-2">
                <IconWarning size={16} className="text-red-400 mt-1 flex-shrink-0" />
                <span>Surveillance without consent is illegal in most jurisdictions</span>
              </li>
              <li className="flex items-start gap-2">
                <IconWarning size={16} className="text-red-400 mt-1 flex-shrink-0" />
                <span>Rate limitations and warnings are implemented to prevent misuse</span>
              </li>
              <li className="flex items-start gap-2">
                <IconWarning size={16} className="text-red-400 mt-1 flex-shrink-0" />
                <span>We reserve the right to take down the service if abuse is detected</span>
              </li>
            </ul>
            <p className="text-sm text-slate-500">
              Use SafeOS responsibly. Monitor only those you have legal authority to monitor,
              and always respect privacy laws in your jurisdiction.
            </p>
          </div>
        </section>

        {/* Built by Frame.dev */}
        <section className="mb-16">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-400">07</span>
            Built by Frame.dev
          </h3>
          <div className="p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 relative flex-shrink-0">
                <Image
                  src="/logos/frame.svg"
                  alt="Frame.dev"
                  width={64}
                  height={64}
                  className="object-contain"
                />
              </div>
              <div>
                <h4 className="font-semibold text-white text-lg">Frame.dev</h4>
                <p className="text-sm text-slate-400">Building tools for humanity</p>
              </div>
            </div>
            <p className="text-slate-300 leading-relaxed mb-4">
              SafeOS Guardian is created by the team at{' '}
              <a
                href="https://frame.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                Frame.dev
              </a>
              . We&apos;re a small team of developers passionate about building open-source tools
              that make a real difference in people&apos;s lives.
            </p>
            <p className="text-slate-400 leading-relaxed mb-4">
              We believe AI should be accessible to everyone, not just large corporations. That&apos;s why
              SafeOS runs entirely in your browser—no expensive servers, no subscriptions, no gatekeeping.
            </p>
            <a
              href="https://frame.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 hover:bg-blue-500/30 transition-colors"
            >
              Visit Frame.dev
              <IconExternalLink size={16} />
            </a>
          </div>
        </section>

        {/* Contact */}
        <section className="mb-16">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-emerald-400">08</span>
            Contact
          </h3>
          <div className="p-6 bg-slate-900 border border-slate-700 rounded-xl">
            <p className="text-slate-300 leading-relaxed mb-4">
              Have questions, feedback, or want to contribute? We&apos;d love to hear from you.
            </p>
            <div className="space-y-2">
              <p className="text-slate-400">
                <strong className="text-white">GitHub:</strong>{' '}
                <a
                  href="https://github.com/framerslab/safeos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  github.com/framerslab/safeos
                </a>
              </p>
              <p className="text-slate-400">
                <strong className="text-white">Email:</strong>{' '}
                <a
                  href="mailto:team@frame.dev"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  team@frame.dev
                </a>
              </p>
              <p className="text-slate-400">
                <strong className="text-white">Website:</strong>{' '}
                <a
                  href="https://frame.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  frame.dev
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* Forever Free */}
        <section className="text-center">
          <div className="inline-block p-6 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-2xl">
            <p className="text-lg font-medium text-white mb-2">
              SafeOS Guardian will always be free.
            </p>
            <p className="text-sm text-slate-400">
              No subscriptions. No hidden fees. No data selling. Ever.
            </p>
          </div>
        </section>

        {/* Links */}
        <div className="mt-12 flex justify-center gap-4">
          <Link
            href="/tutorials"
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
          >
            View Tutorials
          </Link>
          <Link
            href="/donate"
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Support Us
          </Link>
        </div>
      </main>
    </div>
  );
}


























