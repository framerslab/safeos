/**
 * Use Case Showcase Component
 *
 * Displays all supported monitoring use cases with:
 * - Custom SVG icons for each use case
 * - FREE labels (everything is free!)
 * - Quick action buttons that pre-configure settings via URL params
 * - Clear explanations of how each use case works
 *
 * USE CASES SUPPORTED:
 * 1. Baby Monitoring - Ultra-sensitive sleep monitoring
 * 2. Pet Care - Watch your pets, call them home when detected
 * 3. Elderly Care - Activity monitoring with inactivity alerts
 * 4. Lost & Found - Watch the camera for an animal with a lost pet's colours
 * 5. Security - Intruder detection and person alerts
 * 6. Wildlife - Watch backyard wildlife activity
 *
 * @module components/UseCaseShowcase
 */

import React from 'react';
import Link from 'next/link';

// =============================================================================
// Use Case Configurations
// =============================================================================

interface UseCase {
  id: string;
  name: string;
  tagline: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  presetId: string;
  quickStartUrl: string;
  learnMoreUrl?: string;
}

const USE_CASES: UseCase[] = [
  {
    id: 'baby',
    name: 'Baby Monitoring',
    tagline: 'Supplemental alerts for short naps',
    description:
      'A supplementary alert layer for when you AND your infant are napping nearby. Provides audio cues if movement or sounds are detected — NOT a replacement for supervision.',
    features: [
      'SUPPLEMENTARY ONLY — not a babysitter replacement',
      'Best for short naps when parent is also resting nearby',
      'Audio/visual alerts to wake you if needed',
      'Runs in your browser; frames are not uploaded unless you connect your own server',
    ],
    icon: <BabyIcon />,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/30',
    presetId: 'infant_sleep',
    quickStartUrl: '/monitor?preset=infant_sleep&scenario=baby',
  },
  {
    id: 'pet',
    name: 'Pet Care',
    tagline: 'Extra awareness for brief absences',
    description:
      'A supplementary layer to get alerts about your pets during brief absences from the room. Play custom sounds when detected — but NEVER leave pets unattended for long periods.',
    features: [
      'SUPPLEMENTARY ONLY — not a pet-sitter replacement',
      'Best for brief room absences (bathroom, quick errands)',
      'Custom sound recordings for pet recall',
    ],
    icon: <PetIcon />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    presetId: 'pet_monitoring',
    quickStartUrl: '/monitor?preset=pet_monitoring&scenario=pet',
  },
  {
    id: 'elderly',
    name: 'Elderly Care',
    tagline: 'Supplemental wellness check-ins',
    description:
      'A supplementary alert system for additional peace of mind. Get notified of extended inactivity — but this is NOT a replacement for proper care or regular check-ins. Tell the person and have their agreement before you watch or listen.',
    features: [
      'SUPPLEMENTARY ONLY — not a caregiver replacement',
      'Additional awareness layer, not primary care',
      'Inactivity alerts as backup notification',
      'Privacy-first local processing',
      'Works alongside regular human check-ins',
    ],
    icon: <ElderlyIcon />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    presetId: 'elderly_care',
    quickStartUrl: '/monitor?preset=balanced&scenario=elderly',
  },
  {
    id: 'lost-found',
    name: 'Lost & Found',
    tagline: 'Watch your camera for a lost pet',
    description:
      'Upload photos of your lost pet. SafeOS watches your own camera for an animal with the same colouring. It matches colours, so another animal of similar colour can set it off. This is a supplementary search aid — keep searching.',
    features: [
      'SUPPLEMENTARY SEARCH AID — not primary search method',
      'Covers the one spot your camera sees',
      'Matches colours and size, not identity',
      'Alerts when potential match is spotted',
      'Always continue active searching efforts',
    ],
    icon: <LostFoundIcon />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    presetId: 'balanced',
    quickStartUrl: '/lost-found?action=add',
  },
  {
    id: 'security',
    name: 'Security',
    tagline: 'Supplemental intruder awareness',
    description:
      'A supplementary alert layer for home awareness. Provides motion/person alerts — but is NOT a replacement for proper security systems, locks, or professional monitoring.',
    features: [
      'SUPPLEMENTARY ONLY — not a security system replacement',
      'Additional awareness layer for peace of mind',
      'On-device alerts (sound + browser notifications)',
      'Best used alongside proper locks and security',
      'Detection zones for focused monitoring',
    ],
    icon: <SecurityIcon />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    presetId: 'maximum_sensitivity',
    quickStartUrl: '/monitor?preset=maximum_sensitivity&scenario=security',
  },
  {
    id: 'wildlife',
    name: 'Wildlife Watching',
    tagline: 'Observe backyard visitors',
    description:
      'Capture wildlife activity in your yard. This is for observation and enjoyment — the AI detects animals and logs sightings for nature enthusiasts.',
    features: [
      'Casual observation tool for nature lovers',
      'Detects ten kinds of animal with COCO-SSD',
      'Saves a still frame of each sighting',
    ],
    icon: <WildlifeIcon />,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    presetId: 'balanced',
    quickStartUrl: '/wildlife?setup=true',
  },
];

// =============================================================================
// Component
// =============================================================================

interface UseCaseShowcaseProps {
  className?: string;
  compact?: boolean;
  showOnlyIds?: string[];
}

export function UseCaseShowcase({
  className = '',
  compact = false,
  showOnlyIds,
}: UseCaseShowcaseProps) {
  const displayCases = showOnlyIds
    ? USE_CASES.filter((uc) => showOnlyIds.includes(uc.id))
    : USE_CASES;

  return (
    <section className={className}>
      {!compact && (
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 text-sm mb-4">
            <span className="font-bold">⚠️ SUPPLEMENTARY TOOL</span>
            <span className="text-slate-400">•</span>
            <span>Not a Replacement for Human Care</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Supplementary Use Cases
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            SafeOS provides <strong className="text-amber-400">additional awareness</strong> as a backup layer.
            It is <strong className="text-red-400">NOT a replacement</strong> for human supervision, professional care, or proper security systems.
          </p>
        </div>
      )}

      <div className={`grid gap-4 ${compact ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
        {displayCases.map((useCase) => (
          <UseCaseCard key={useCase.id} useCase={useCase} compact={compact} />
        ))}
      </div>
    </section>
  );
}

// =============================================================================
// Use Case Card Component
// =============================================================================

interface UseCaseCardProps {
  useCase: UseCase;
  compact?: boolean;
}

function UseCaseCard({ useCase, compact }: UseCaseCardProps) {
  return (
    <div
      className={`relative rounded-xl border transition-all hover:scale-[1.02] ${useCase.bgColor} ${useCase.borderColor}`}
    >
      {/* FREE Badge */}
      <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full shadow-lg">
        FREE
      </div>

      <div className={compact ? 'p-4' : 'p-6'}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-12 h-12 rounded-xl ${useCase.bgColor} border ${useCase.borderColor} flex items-center justify-center`}>
            <div className={useCase.color}>{useCase.icon}</div>
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold">{useCase.name}</h3>
            <p className={`text-xs ${useCase.color}`}>{useCase.tagline}</p>
          </div>
        </div>

        {!compact && (
          <>
            {/* Description */}
            <p className="text-sm text-slate-400 mb-4">{useCase.description}</p>

            {/* Features */}
            <ul className="space-y-1.5 mb-4" aria-label="Features">
              {useCase.features.slice(0, 3).map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                  <svg className={`w-3 h-3 flex-shrink-0 mt-0.5 ${useCase.color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span>{feature}</span>
                </li>
              ))}
              {useCase.features.length > 3 && (
                <li className="text-xs text-slate-500">
                  +{useCase.features.length - 3} more features
                </li>
              )}
            </ul>
          </>
        )}

        {/* Quick Start Button */}
        <Link
          href={useCase.quickStartUrl}
          className={`block w-full text-center py-2 rounded-lg font-medium transition-colors ${
            compact ? 'text-xs' : 'text-sm'
          } ${useCase.bgColor} ${useCase.color} border ${useCase.borderColor} hover:bg-opacity-50`}
        >
          {compact ? 'Start' : 'Quick Start →'}
        </Link>
      </div>
    </div>
  );
}

// =============================================================================
// SVG Icons
// =============================================================================

function BabyIcon() {
  return (
    <svg
      className="w-6 h-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Baby face */}
      <circle cx="12" cy="10" r="6" />
      {/* Eyes */}
      <circle cx="10" cy="9" r="0.5" fill="currentColor" />
      <circle cx="14" cy="9" r="0.5" fill="currentColor" />
      {/* Smile */}
      <path d="M10 12c0.5 0.5 1 0.7 2 0.7s1.5-0.2 2-0.7" />
      {/* Pacifier */}
      <ellipse cx="12" cy="14" rx="1.5" ry="1" />
      {/* Hair tuft */}
      <path d="M10 4.5c0.5-0.5 1.5-0.5 2-0.3 0.5 0.2 1.5 0.2 2 0.8" />
      {/* Blanket */}
      <path d="M6 16c1-1 4-1.5 6-1.5s5 0.5 6 1.5v4c0 1-0.5 1.5-1.5 1.5h-9c-1 0-1.5-0.5-1.5-1.5v-4z" />
    </svg>
  );
}

function PetIcon() {
  return (
    <svg
      className="w-6 h-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Dog face shape */}
      <path d="M12 20c-4 0-7-2-7-5 0-2 1-4 3-5" />
      <path d="M12 20c4 0 7-2 7-5 0-2-1-4-3-5" />
      {/* Ears */}
      <path d="M5 10c-1-3 0-6 2-7 1 1 1 3 1 4" />
      <path d="M19 10c1-3 0-6-2-7-1 1-1 3-1 4" />
      {/* Head top */}
      <path d="M8 7c1-2 3-3 4-3s3 1 4 3" />
      {/* Eyes */}
      <circle cx="9" cy="11" r="1" fill="currentColor" />
      <circle cx="15" cy="11" r="1" fill="currentColor" />
      {/* Nose */}
      <ellipse cx="12" cy="14" rx="2" ry="1.5" fill="currentColor" />
      {/* Mouth */}
      <path d="M12 15.5v1.5" />
      <path d="M10 17c0.5 0.5 1.3 1 2 1s1.5-0.5 2-1" />
    </svg>
  );
}

function ElderlyIcon() {
  return (
    <svg
      className="w-6 h-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Head */}
      <circle cx="12" cy="6" r="3" />
      {/* Body */}
      <path d="M12 9v5" />
      {/* Arms */}
      <path d="M8 11l4 2 4-2" />
      {/* Walking cane */}
      <path d="M16 14l2 8" />
      <path d="M16 22h4" />
      {/* Legs */}
      <path d="M12 14l-3 8" />
      <path d="M12 14l1 8" />
      {/* Glasses */}
      <circle cx="10.5" cy="5.5" r="1" />
      <circle cx="13.5" cy="5.5" r="1" />
      <path d="M11.5 5.5h1" />
    </svg>
  );
}

function LostFoundIcon() {
  return (
    <svg
      className="w-6 h-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Magnifying glass */}
      <circle cx="10" cy="10" r="6" />
      <path d="M14.5 14.5l5 5" />
      {/* Paw print inside */}
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
      <circle cx="7" cy="11" r="0.8" fill="currentColor" />
      <circle cx="10" cy="12" r="1.2" fill="currentColor" />
      <circle cx="13" cy="11" r="0.8" fill="currentColor" />
    </svg>
  );
}

function SecurityIcon() {
  return (
    <svg
      className="w-6 h-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Shield */}
      <path d="M12 3l8 3v5c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V6l8-3z" />
      {/* Checkmark */}
      <path d="M8 12l3 3 5-6" strokeWidth={2} />
    </svg>
  );
}

function WildlifeIcon() {
  return (
    <svg
      className="w-6 h-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Bird body */}
      <ellipse cx="12" cy="14" rx="5" ry="4" />
      {/* Head */}
      <circle cx="15" cy="10" r="2.5" />
      {/* Beak */}
      <path d="M17.5 10l2.5 0.5-2.5 0.5" />
      {/* Eye */}
      <circle cx="15.5" cy="9.5" r="0.5" fill="currentColor" />
      {/* Wing */}
      <path d="M8 13c2-1 4-1 5 0" />
      {/* Tail */}
      <path d="M7 15l-3 2" />
      <path d="M7 14l-4 1" />
      {/* Legs */}
      <path d="M10 18v3" />
      <path d="M14 18v3" />
      {/* Feet */}
      <path d="M9 21h2" />
      <path d="M13 21h2" />
    </svg>
  );
}

// =============================================================================
// Export Default
// =============================================================================

export default UseCaseShowcase;
