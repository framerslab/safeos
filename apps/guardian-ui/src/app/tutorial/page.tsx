/**
 * Tutorial Page
 *
 * Interactive tutorial for new users.
 *
 * @module app/tutorial/page
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { NotAMedicalDevice } from '../../components/NotAMedicalDevice';

// =============================================================================
// Types
// =============================================================================

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  tips: string[];
}

// =============================================================================
// Tutorial Steps
// =============================================================================

const tutorialSteps: TutorialStep[] = [
  {
    id: 1,
    title: 'Accept the Disclaimer',
    description: 'SafeOS is a supplementary tool—never a replacement for human care. Read and accept our disclaimer to continue.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    tips: [
      'Setup asks you to accept it before you continue',
      'Read what SafeOS can and cannot do',
      'Never leave dependents unattended with only this system',
    ],
  },
  {
    id: 2,
    title: 'Choose Your Monitoring Profile',
    description: 'Select what you\'re monitoring: pets, babies, or elderly. Each profile has optimized detection settings.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    tips: [
      'Pet: alerts on movement and loud sound',
      'Baby: alerts on small movements and loud sound, such as crying',
      'Elderly: alerts on movement, loud sound, and no movement for a set time',
      'Tell any adult you watch or listen to, and have their agreement first',
    ],
  },
  {
    id: 3,
    title: 'Allow Camera & Microphone',
    description: 'Grant browser permissions to access your camera and microphone for monitoring.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    tips: [
      'Camera is required for visual monitoring',
      'Microphone is optional but recommended',
      'Frames stay in your browser unless you connect your own server',
    ],
  },
  {
    id: 4,
    title: 'Position Your Camera',
    description: 'Place your camera to capture the area you want to monitor. Good positioning improves detection accuracy.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    tips: [
      'Eye level with your subject works best',
      'Ensure good lighting (avoid backlighting)',
      'Stable mounting reduces false alerts',
    ],
  },
  {
    id: 5,
    title: 'Start Monitoring',
    description: 'Click "Start Monitoring" to begin. SafeOS compares frames for motion and measures sound levels in your browser.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    tips: [
      'First analysis may take a few seconds',
      'Motion detection is done in your browser',
      'Frames go to a server only if you connect one you run yourself',
    ],
  },
  {
    id: 6,
    title: 'Respond to Alerts',
    description: 'When something is detected, you\'ll receive alerts. Acknowledge them to stop escalation.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    tips: [
      'Alerts escalate in volume over time',
      'Tap "Acknowledge" to confirm you\'ve seen it',
      'Browser notifications work on this device; remote alerts require an optional monitoring server',
    ],
  },
];

// =============================================================================
// Component
// =============================================================================

export default function TutorialPage() {
  const [currentStep, setCurrentStep] = useState(0);

  const step = tutorialSteps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === tutorialSteps.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="p-4 sm:p-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Home</span>
          </Link>

          <Link
            href="/setup"
            className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Skip Tutorial →
          </Link>
        </div>
      </header>

      {/* Progress */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 mb-8">
        <div className="flex items-center gap-2">
          {tutorialSteps.map((_, index) => (
            <div
              key={index}
              className={`
                flex-1 h-1 rounded-full transition-colors
                ${index <= currentStep ? 'bg-emerald-500' : 'bg-slate-700'}
              `}
            />
          ))}
        </div>
        <p className="text-center text-sm text-slate-400 mt-2">
          Step {currentStep + 1} of {tutorialSteps.length}
        </p>
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-12">
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden">
          {/* Step Header */}
          <div className="p-8 text-center border-b border-slate-700/50">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white">
              {step.icon}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              {step.title}
            </h1>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              {step.description}
            </p>
          </div>

          {/* Tips */}
          <div className="p-8">
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
              Tips
            </h2>
            <ul className="space-y-3">
              {step.tips.map((tip, index) => (
                <li key={index} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-slate-300">{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Navigation */}
          <div className="p-8 bg-slate-900/50 border-t border-slate-700/50 flex items-center justify-between">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={isFirst}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                ${isFirst
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }
              `}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>

            {isLast ? (
              <Link
                href="/setup"
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-medium hover:opacity-90 transition-opacity"
              >
                Get Started
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ) : (
              <button
                onClick={() => setCurrentStep(Math.min(tutorialSteps.length - 1, currentStep + 1))}
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-medium hover:opacity-90 transition-opacity"
              >
                Next
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <NotAMedicalDevice className="mt-6 text-sm text-slate-400 text-center" />

        {/* Quick Links */}
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <Link
            href="/docs/QUICKSTART.md"
            className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors"
          >
            <h3 className="text-white font-medium mb-1 flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              Quick Start Guide
            </h3>
            <p className="text-sm text-slate-400">Detailed setup instructions</p>
          </Link>

          <Link
            href="/api/docs"
            className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors"
          >
            <h3 className="text-white font-medium mb-1 flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              API Documentation
            </h3>
            <p className="text-sm text-slate-400">Integrate with other systems</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
