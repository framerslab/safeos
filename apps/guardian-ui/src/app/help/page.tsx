/**
 * Help & FAQ Page
 *
 * Help documentation and frequently asked questions.
 *
 * @module app/help/page
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShortcutList } from '../../hooks/useKeyboardShortcuts';
import { NotAMedicalDevice } from '../../components/NotAMedicalDevice';

// =============================================================================
// Types
// =============================================================================

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

interface HelpSection {
  id: string;
  title: string;
  icon: React.ReactNode;
}

// =============================================================================
// Data
// =============================================================================

// Section icons as accessible SVGs
const sectionIcons: Record<string, React.ReactNode> = {
  'getting-started': (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  ),
  'faq': (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  'shortcuts': (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <path d="M6 8h.001" />
      <path d="M10 8h.001" />
      <path d="M14 8h.001" />
      <path d="M18 8h.001" />
      <path d="M8 12h.001" />
      <path d="M12 12h.001" />
      <path d="M16 12h.001" />
      <path d="M7 16h10" />
    </svg>
  ),
  'troubleshooting': (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  'contact': (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

// Contact section icons
const contactIcons: Record<string, React.ReactNode> = {
  github: (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  email: (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  ),
  twitter: (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
    </svg>
  ),
};

const faqs: FAQItem[] = [
  {
    category: 'general',
    question: 'What is SafeOS Guardian?',
    answer: 'SafeOS Guardian is a free monitoring tool for pets, babies, and elderly care. It uses your device\'s camera and microphone to watch for motion and sound and alerts you in real time. Frame builds SafeOS and pays for its development.',
  },
  {
    category: 'general',
    question: 'Is SafeOS free?',
    answer: 'Yes. SafeOS is free to use. Frame (Framers Lab, Inc.) pays for its development.',
  },
  {
    category: 'general',
    question: 'Can SafeOS replace professional care?',
    answer: 'No. SafeOS is a SUPPLEMENTARY tool only. It should never replace direct human care, professional care, or parental supervision. Always ensure proper care is provided.',
  },
  {
    category: 'privacy',
    question: 'What happens to my video data?',
    answer: 'Video is processed in your browser. The motion check keeps only the last three frames in memory. Frames that Security, Wildlife or Lost & Found save stay in your browser\'s IndexedDB. If you connect a server you run yourself, the monitor sends frames to it.',
  },
  {
    category: 'privacy',
    question: 'Do you store my data on servers?',
    answer: 'No. safeos.sh runs no server of ours. Settings stay in your browser\'s localStorage, and saved frames and alerts in IndexedDB. If you run the optional SafeOS server yourself, it stores what it receives on that server.',
  },
  {
    category: 'privacy',
    question: 'How does human review work?',
    answer: 'safeos.sh sends nothing to anyone for review. Human review is part of the optional SafeOS server, for the people who run that server. It does not blur faces or images.',
  },
  {
    category: 'technical',
    question: 'What browsers are supported?',
    answer: 'SafeOS works best in modern browsers like Chrome, Firefox, Safari, and Edge. The browser must support WebRTC and IndexedDB for full functionality.',
  },
  {
    category: 'technical',
    question: 'Why does it need camera/microphone access?',
    answer: 'Camera access is needed to monitor visual activity. Microphone access enables sound-level alerts. Setup asks for both together. All processing happens in your browser.',
  },
  {
    category: 'technical',
    question: 'How does the AI work?',
    answer: 'On safeos.sh, the monitor compares frames and sound levels in your browser, and Security and Wildlife modes run the COCO-SSD model in your browser. If you run the optional SafeOS server, it can also send frames to a local Ollama model, and to a cloud model you configure when the local one fails.',
  },
  {
    category: 'alerts',
    question: 'Why are my alerts getting louder?',
    answer: 'Unacknowledged alerts automatically escalate in volume over time, so an alert you have not answered is harder to miss. Acknowledge the alert to stop escalation.',
  },
  {
    category: 'alerts',
    question: 'Can I get alerts when away from my computer?',
    answer: 'Browser notifications work on this device while your browser/app is running. For true remote alerts (phone away from home), you’ll need an optional SafeOS monitoring server (API) plus an integration (webhooks today; SMS/Telegram require provider credentials).',
  },
  {
    category: 'alerts',
    question: 'Too many false alerts - what should I do?',
    answer: 'Adjust motion and audio sensitivity in Settings > Detection. Higher sensitivity values mean fewer alerts. You can also try repositioning your camera to reduce background movement.',
  },
];

const sections: HelpSection[] = [
  { id: 'getting-started', title: 'Getting Started', icon: sectionIcons['getting-started'] },
  { id: 'faq', title: 'FAQ', icon: sectionIcons['faq'] },
  { id: 'shortcuts', title: 'Keyboard Shortcuts', icon: sectionIcons['shortcuts'] },
  { id: 'troubleshooting', title: 'Troubleshooting', icon: sectionIcons['troubleshooting'] },
  { id: 'contact', title: 'Contact Support', icon: sectionIcons['contact'] },
];

// =============================================================================
// Component
// =============================================================================

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState('getting-started');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [faqCategory, setFaqCategory] = useState<string>('all');

  const filteredFaqs = faqCategory === 'all' 
    ? faqs 
    : faqs.filter((f) => f.category === faqCategory);

  const categories = ['all', ...Array.from(new Set(faqs.map((f) => f.category)))];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="p-4 sm:p-6 border-b border-slate-700/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-white">Help & FAQ</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar */}
          <nav className="md:w-56 flex-shrink-0">
            <ul className="space-y-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      activeSection === section.id
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <span>{section.icon}</span>
                    <span>{section.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <main className="flex-1">
            {activeSection === 'getting-started' && (
              <div className="space-y-6">
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                  <h2 className="text-2xl font-bold text-white mb-4">Getting Started with SafeOS</h2>
                  <p className="text-slate-300 mb-6">
                    Welcome to SafeOS Guardian! Follow these steps to set up your first monitoring session.
                  </p>

                  <div className="space-y-6">
                    {/* Step 1 */}
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0">
                        1
                      </div>
                      <div>
                        <h3 className="text-white font-medium mb-1">Accept the Disclaimer</h3>
                        <p className="text-sm text-slate-400">
                          Read and accept our safety disclaimer. This is required to continue.
                        </p>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0">
                        2
                      </div>
                      <div>
                        <h3 className="text-white font-medium mb-1">Choose Your Profile</h3>
                        <p className="text-sm text-slate-400">
                          Select what you&apos;re monitoring: pets, babies, or elderly. Each profile has optimized settings.
                        </p>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0">
                        3
                      </div>
                      <div>
                        <h3 className="text-white font-medium mb-1">Allow Camera Access</h3>
                        <p className="text-sm text-slate-400">
                          Grant browser permission to access your camera (and optionally microphone).
                        </p>
                      </div>
                    </div>

                    {/* Step 4 */}
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold flex-shrink-0">
                        4
                      </div>
                      <div>
                        <h3 className="text-white font-medium mb-1">Start Monitoring</h3>
                        <p className="text-sm text-slate-400">
                          Click &quot;Start Monitoring&quot; and position your camera. SafeOS starts watching for motion and sound.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <Link
                      href="/tutorial"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                    >
                      Start Interactive Tutorial
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>

                {/* Integrations CTA */}
                <Link
                  href="/help/integrations"
                  className="block bg-slate-800/50 rounded-xl border border-emerald-500/30 hover:border-emerald-500/60 p-6 transition-colors group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white mb-1">Integrations &amp; setup guides</h3>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        Step-by-step walkthroughs for Resend email, Twilio SMS, Telegram, browser push, and Ollama.
                        Everything is optional — pick whichever channels you want.
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-slate-500 group-hover:text-emerald-300 transition-colors flex-shrink-0 mt-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>

                <NotAMedicalDevice className="text-sm text-slate-400" />
              </div>
            )}

            {activeSection === 'faq' && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Frequently Asked Questions</h2>
                  <select
                    value={faqCategory}
                    onChange={(e) => setFaqCategory(e.target.value)}
                    className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="divide-y divide-slate-700/50">
                  {filteredFaqs.map((faq, index) => (
                    <div key={index}>
                      <button
                        onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                        className="w-full p-4 text-left hover:bg-slate-700/30 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-white font-medium pr-4">{faq.question}</h3>
                          <svg
                            className={`w-5 h-5 text-slate-400 transform transition-transform ${
                              expandedFaq === index ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {expandedFaq === index && (
                        <div className="px-4 pb-4">
                          <p className="text-slate-300">{faq.answer}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'shortcuts' && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Keyboard Shortcuts</h2>
                <p className="text-slate-400 mb-6">
                  Use these keyboard shortcuts for faster navigation.
                </p>
                <ShortcutList />
              </div>
            )}

            {activeSection === 'troubleshooting' && (
              <div className="space-y-6">
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">Common Issues</h2>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <h3 className="text-white font-medium mb-2">Camera not working</h3>
                      <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                        <li>Check that you&apos;ve granted camera permissions</li>
                        <li>Make sure no other app is using the camera</li>
                        <li>Try refreshing the page</li>
                        <li>Check browser camera settings</li>
                      </ul>
                    </div>

                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <h3 className="text-white font-medium mb-2">Server AI analysis not running</h3>
                      <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                        <li>Ensure Ollama is running locally</li>
                        <li>Check that required models are installed</li>
                        <li>Verify network connection for cloud fallback</li>
                      </ul>
                    </div>

                    <div className="p-4 bg-slate-700/30 rounded-lg">
                      <h3 className="text-white font-medium mb-2">Notifications not appearing</h3>
                      <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                        <li>Enable browser notifications in system settings</li>
                        <li>Check Settings → Notifications in SafeOS</li>
                        <li>Ensure you&apos;re not in Quiet Hours mode</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6">
                  <h3 className="text-amber-400 font-medium mb-2">Still having issues?</h3>
                  <p className="text-slate-300 text-sm">
                    If you&apos;re still experiencing problems, please reach out to our support team with
                    details about your browser, device, and the specific issue you&apos;re facing.
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'contact' && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Contact Support</h2>
                <p className="text-slate-300 mb-6">
                  Need help? Reach out through any of these channels:
                </p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <a
                    href="https://github.com/framerslab/safeos/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
                  >
                    <span className="text-slate-300">{contactIcons.github}</span>
                    <h3 className="text-white font-medium mt-2">GitHub Issues</h3>
                    <p className="text-sm text-slate-400">Report bugs and request features</p>
                  </a>

                  <a
                    href="mailto:team@frame.dev"
                    className="p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
                  >
                    <span className="text-slate-300">{contactIcons.email}</span>
                    <h3 className="text-white font-medium mt-2">Email Support</h3>
                    <p className="text-sm text-slate-400">team@frame.dev</p>
                  </a>

                  <a
                    href="https://twitter.com/framedev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
                  >
                    <span className="text-slate-300">{contactIcons.twitter}</span>
                    <h3 className="text-white font-medium mt-2">Twitter/X</h3>
                    <p className="text-sm text-slate-400">@framedev</p>
                  </a>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}



























