/**
 * Donate Page
 *
 * Sponsor SafeOS Guardian via GitHub Sponsors at github.com/sponsors/framerslab.
 * A sponsorship supports development by Frame (Framers Lab, Inc.); it is not a
 * tax-deductible donation.
 *
 * @module app/donate/page
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  IconChevronLeft,
  IconHeart,
  IconShield,
  IconZap,
  IconGlobe,
  IconCpu,
  IconPhone,
  IconExternalLink,
} from '../../components/icons';

export const metadata: Metadata = {
  title: 'Support SafeOS',
  description: 'Sponsor SafeOS Guardian development by Frame (Framers Lab, Inc.) through GitHub Sponsors.',
};

// =============================================================================
// Constants
// =============================================================================

const SPONSOR_URL = 'https://github.com/sponsors/framerslab';
const GITHUB_REPO = 'https://github.com/framerslab/safeos';
const GITHUB_ISSUES = 'https://github.com/framerslab/safeos/issues';

// =============================================================================
// Animated SVG Components
// =============================================================================

function AnimatedHeartShield() {
  return (
    <div className="relative w-48 h-48">
      {/* Outer glow rings */}
      <div className="absolute inset-0 animate-ping-slow">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="url(#glowGradient)"
            strokeWidth="2"
            opacity="0.3"
          />
          <defs>
            <linearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      
      {/* Secondary ring */}
      <div className="absolute inset-4 animate-pulse-subtle">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle
            cx="100"
            cy="100"
            r="80"
            fill="none"
            stroke="url(#ringGradient)"
            strokeWidth="1"
            strokeDasharray="10 5"
            opacity="0.5"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 100 100"
              to="360 100 100"
              dur="20s"
              repeatCount="indefinite"
            />
          </circle>
          <defs>
            <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      
      {/* Main shield with heart */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981">
              <animate
                attributeName="stop-color"
                values="#10b981;#3b82f6;#ec4899;#10b981"
                dur="6s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="50%" stopColor="#3b82f6">
              <animate
                attributeName="stop-color"
                values="#3b82f6;#ec4899;#10b981;#3b82f6"
                dur="6s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="#ec4899">
              <animate
                attributeName="stop-color"
                values="#ec4899;#10b981;#3b82f6;#ec4899"
                dur="6s"
                repeatCount="indefinite"
              />
            </stop>
          </linearGradient>
          
          <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
          
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Shield shape */}
        <path
          d="M100 20
             C100 20 160 30 170 40
             C180 50 180 80 175 110
             C170 140 145 170 100 190
             C55 170 30 140 25 110
             C20 80 20 50 30 40
             C40 30 100 20 100 20Z"
          fill="url(#shieldGradient)"
          opacity="0.15"
          stroke="url(#shieldGradient)"
          strokeWidth="2"
          filter="url(#glow)"
        >
          <animate
            attributeName="d"
            values="
              M100 20 C100 20 160 30 170 40 C180 50 180 80 175 110 C170 140 145 170 100 190 C55 170 30 140 25 110 C20 80 20 50 30 40 C40 30 100 20 100 20Z;
              M100 18 C100 18 162 32 172 42 C182 52 182 82 177 112 C172 142 147 172 100 192 C53 172 28 142 23 112 C18 82 18 52 28 42 C38 32 100 18 100 18Z;
              M100 20 C100 20 160 30 170 40 C180 50 180 80 175 110 C170 140 145 170 100 190 C55 170 30 140 25 110 C20 80 20 50 30 40 C40 30 100 20 100 20Z"
            dur="3s"
            repeatCount="indefinite"
          />
        </path>
        
        {/* Heart shape inside shield */}
        <g transform="translate(100, 100)" filter="url(#glow)">
          <path
            d="M0 -25
               C-12 -45 -40 -40 -40 -15
               C-40 15 0 45 0 45
               C0 45 40 15 40 -15
               C40 -40 12 -45 0 -25Z"
            fill="url(#heartGradient)"
            opacity="0.9"
          >
            <animate
              attributeName="transform"
              type="scale"
              values="1;1.1;1"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </path>
        </g>
        
        {/* Sparkles */}
        <g opacity="0.8">
          <circle cx="50" cy="60" r="2" fill="#10b981">
            <animate attributeName="opacity" values="0;1;0" dur="2s" begin="0s" repeatCount="indefinite"/>
          </circle>
          <circle cx="150" cy="70" r="2" fill="#3b82f6">
            <animate attributeName="opacity" values="0;1;0" dur="2s" begin="0.5s" repeatCount="indefinite"/>
          </circle>
          <circle cx="70" cy="150" r="2" fill="#ec4899">
            <animate attributeName="opacity" values="0;1;0" dur="2s" begin="1s" repeatCount="indefinite"/>
          </circle>
          <circle cx="130" cy="145" r="2" fill="#10b981">
            <animate attributeName="opacity" values="0;1;0" dur="2s" begin="1.5s" repeatCount="indefinite"/>
          </circle>
        </g>
      </svg>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function DonatePage() {
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
                <IconHeart size={22} className="text-pink-400" />
                <h1 className="text-xl font-bold text-white">Support SafeOS</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-8">
            <AnimatedHeartShield />
          </div>

          <h2 className="text-3xl font-bold text-white mb-4">Sponsor SafeOS Guardian</h2>

          <p className="text-lg text-slate-300 max-w-xl mx-auto leading-relaxed">
            SafeOS is open source and free to use. A sponsorship pays for development time
            on SafeOS and the hosting that keeps safeos.sh online.
          </p>
        </div>

        {/* Primary CTA — GitHub Sponsors */}
        <div className="mb-12 p-6 bg-gradient-to-br from-pink-500/10 to-emerald-500/10 border border-pink-500/30 rounded-2xl">
          <div className="text-center mb-5">
            <h3 className="text-xl font-semibold text-white mb-2">Sponsor on GitHub</h3>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              A sponsorship goes to{' '}
              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline font-medium"
              >
                framerslab
              </a>
              , the GitHub account of Frame (Framers Lab, Inc.), which builds SafeOS and AgentOS.
              It supports development and is not a tax-deductible donation.
            </p>
          </div>

          <a
            href={SPONSOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors group mb-3"
          >
            <IconHeart size={20} className="text-white group-hover:scale-110 transition-transform" />
            Sponsor framerslab on GitHub
            <IconExternalLink size={16} className="opacity-70" />
          </a>

          <p className="mt-4 text-center text-xs text-slate-400">
            One-time or monthly. GitHub charges no fee on sponsorships from personal accounts
            and up to 6% on sponsorships from organization accounts.
          </p>
        </div>

        {/* Humanitarian commitment */}
        <div className="mb-12 p-6 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-2xl text-center">
          <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-full">
            <IconShield size={14} className="text-emerald-300" />
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-300">
              Humanitarian work
            </span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Frame puts some of its development resources into humanitarian work, and SafeOS is
            part of that work.
          </p>
        </div>

        {/* What sponsorship funds */}
        <div className="mb-12 space-y-4">
          <h3 className="text-center text-sm font-medium text-slate-500 uppercase tracking-wider">
            What sponsorship funds
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(
              [
                { icon: <IconZap size={20} className="text-amber-400" />, title: 'Faster development', desc: 'More features, faster releases.' },
                { icon: <IconGlobe size={20} className="text-blue-400" />, title: 'Global translations', desc: 'Adding non-English language support.' },
                { icon: <IconCpu size={20} className="text-emerald-400" />, title: 'Better detection', desc: 'Tuning the in-browser deep-learning pipeline.' },
                { icon: <IconPhone size={20} className="text-purple-400" />, title: 'Mobile apps', desc: 'Native iOS and Android wrappers via Capacitor.' },
              ] as const
            ).map((item) => (
              <div
                key={item.title}
                className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg text-center"
              >
                <div className="mb-2 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-slate-900/60 border border-slate-700">
                  {item.icon}
                </div>
                <h4 className="font-medium text-white mb-1">{item.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Other ways to help */}
        <div className="text-center">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4">
            Other ways to help
          </h3>
          <div className="space-y-3 text-left">
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 hover:border-emerald-500/40 transition-colors"
            >
              <span className="w-9 h-9 rounded-md bg-amber-500/15 flex items-center justify-center text-amber-300 flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-white text-sm font-medium">Star the repo on GitHub</span>
                <span className="block text-xs text-slate-400">framerslab/safeos</span>
              </span>
              <IconExternalLink size={14} className="text-slate-500 flex-shrink-0" />
            </a>
            <a
              href={GITHUB_ISSUES}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 hover:border-emerald-500/40 transition-colors"
            >
              <span className="w-9 h-9 rounded-md bg-rose-500/15 flex items-center justify-center text-rose-300 flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-white text-sm font-medium">Report bugs &amp; request features</span>
                <span className="block text-xs text-slate-400">github.com/framerslab/safeos/issues</span>
              </span>
              <IconExternalLink size={14} className="text-slate-500 flex-shrink-0" />
            </a>
            <div className="flex items-center gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
              <span className="w-9 h-9 rounded-md bg-blue-500/15 flex items-center justify-center text-blue-300 flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </span>
              <span className="block text-white text-sm">Share SafeOS with anyone who could use a backup pair of eyes.</span>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-slate-400">
            SafeOS Guardian is free to use.
            <br />
            A sponsorship pays for more development time on it.
          </p>
        </div>

        {/* Secondary links */}
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/about"
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            About Us
          </Link>
          <Link
            href="/tutorials"
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Tutorials
          </Link>
        </div>
      </main>
    </div>
  );
}
