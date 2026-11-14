'use client';

/**
 * FAQ Page
 *
 * Comprehensive frequently asked questions about SafeOS Guardian.
 *
 * @module app/faq/page
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  IconChevronLeft,
  IconChevronDown,
  IconSearch,
} from '../../components/icons';
import { NotAMedicalDevice } from '../../components/NotAMedicalDevice';

// =============================================================================
// Types
// =============================================================================

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  name: string;
  icon: string;
  items: FAQItem[];
}

// =============================================================================
// Data
// =============================================================================

const faqCategories: FAQCategory[] = [
  {
    name: 'Getting Started',
    icon: '01',
    items: [
      {
        question: 'What is SafeOS Guardian?',
        answer: 'SafeOS Guardian is a free, open-source monitoring tool that runs entirely in your browser. It uses your device\'s camera and microphone to detect motion and sound, alerting you when activity is detected. It\'s designed for monitoring babies, pets, elderly family members, or any space that needs attention. If you watch or listen to another adult, tell them and have their agreement first.',
      },
      {
        question: 'How do I set up my first monitor?',
        answer: 'Open safeos.sh and press Start Setup. Setup has six steps: a welcome, the safety notice, choosing what you are watching (baby, pet, or elderly relative), allowing the camera and microphone, choosing notifications, and a summary. Then start monitoring. You can change sensitivity in Settings at any time.',
      },
      {
        question: 'Does it work offline?',
        answer: 'Yes, after preparation. Wait for the service worker to finish installing the app files while online. Motion, pixel, and sound alerts need no model. For Security and Wildlife, complete setup and choose Download detection model to save about 18.6 MB from Google model storage. Both pages reuse that model offline. Browser storage must be retained; clearing or evicting it requires another online download. Server integrations still need a connection.',
      },
      {
        question: 'What browsers are supported?',
        answer: 'SafeOS Guardian works on all modern browsers that support the MediaDevices API. This includes Chrome, Firefox, Safari, and Edge on desktop, as well as Chrome and Safari on mobile devices. For the best experience, we recommend using the latest version of Chrome or Firefox.',
      },
      {
        question: 'Is SafeOS Guardian really free?',
        answer: 'Yes. SafeOS at safeos.sh is free: there is no account, no paid tier and no subscription on this site. The code is MIT-licensed, so anyone can run it. Frame builds SafeOS and pays for its development.',
      },
    ],
  },
  {
    name: 'Privacy & Security',
    icon: '02',
    items: [
      {
        question: 'Is my video/audio data stored anywhere?',
        answer: 'Not on any server of ours. Without a server of your own, your video and audio stay in your browser: the monitor compares frames and measures sound levels on your device, and Security and Wildlife run a TensorFlow.js model there. What the app stores stays in your browser: your settings in localStorage, and saved frames and reference photos in IndexedDB. If you connect a server you run yourself and choose a processing mode that uses it, the monitor sends frames to that server.',
      },
      {
        question: 'Does Frame.dev have access to my camera?',
        answer: 'Absolutely not. Frame.dev cannot see, access, or control your camera in any way. SafeOS Guardian runs entirely in your browser—we don\'t operate servers that receive your video feed. Even if we wanted to, we couldn\'t see what your camera captures. Your privacy is architecturally protected.',
      },
      {
        question: 'How does local-first processing work?',
        answer: 'Local-first means the analysis happens on your device. The monitor compares video frames and measures sound levels in your browser. Security and Wildlife modes also run a TensorFlow.js model in the browser to find people and animals. Without a configured server, your camera frames and sound stay in your browser. The page downloads the detection model from Google, which sees your IP address. The GitHub link contacts GitHub only when you open it. If you connect a server you run yourself and choose a processing mode that uses it, the monitor sends frames to that server.',
      },
      {
        question: 'Can I use this without any internet connection?',
        answer: 'Yes, after preparation online. Wait for the service worker to install the exported pages and their scripts, including pages you have not opened. Motion, pixel, and sound alerts need no model. For Security and Wildlife, complete setup and agree to download and save the detection model; both modes can then load it offline. Clearing or evicting browser storage requires another online download. Email, text, and Telegram alerts need your own server and a connection.',
      },
      {
        question: 'What data is collected by SafeOS Guardian?',
        answer: 'We collect no personal data, and the app loads no analytics or tracking script. Your settings stay in your browser. Saved frames from Security, Lost & Found, and Wildlife are kept in your browser\'s IndexedDB. Monitor alerts persist in IndexedDB, reload in History, and remain in history after acknowledgement. Nothing is sent to us.',
      },
    ],
  },
  {
    name: 'Detection & Alerts',
    icon: '03',
    items: [
      {
        question: 'How does motion detection work?',
        answer: 'Motion detection uses frame differencing—we compare consecutive video frames to detect changes. When pixels change beyond a threshold, motion is detected. For sleep monitoring, we use "pixel detection" mode which is ultra-sensitive, detecting even tiny movements of 3-10 pixels. You can adjust sensitivity based on your needs.',
      },
      {
        question: 'What is pixel detection (nap mode)?',
        answer: 'Pixel detection is our ultra-sensitive monitoring mode designed for sleeping babies and pets. Instead of looking for large movements, it detects tiny pixel changes (configurable from 3-10 pixels). This catches small movements, such as a sleeping child stirring.',
      },
      {
        question: 'How sensitive are the alerts?',
        answer: 'Alert sensitivity is fully customizable. You can adjust motion sensitivity (how much movement triggers an alert), audio sensitivity (how loud sounds need to be), and pixel threshold (for sleep monitoring). We also offer presets like "Infant Sleep Monitor" (ultra-sensitive) and "Pet Sleep Monitor" (sensitive).',
      },
      {
        question: 'Can I customize alert sounds?',
        answer: 'Yes! SafeOS Guardian includes multiple alert sounds—gentle chimes for routine alerts, urgent alarms for high-priority events, and custom sound options. You can also adjust volume, enable vibration on mobile devices, and configure quiet hours to prevent alerts during specified times.',
      },
      {
        question: 'How do I reduce false positives?',
        answer: 'To reduce false alerts: 1) Adjust sensitivity sliders lower, 2) Use appropriate presets for your scenario, 3) Ensure stable lighting (sudden light changes can trigger motion), 4) Position the camera to avoid windows or moving objects in the background, 5) Use the alert delay setting to require sustained motion before alerting.',
      },
    ],
  },
  {
    name: 'Technical',
    icon: '04',
    items: [
      {
        question: 'What AI models does SafeOS Guardian use?',
        answer: 'Security and Wildlife modes use COCO-SSD, a TensorFlow.js object detection model, to find people and animals. The monitor page uses no model: it compares video frames for motion and measures sound levels. Everything runs in the browser.',
      },
      {
        question: 'How does TensorFlow.js work in the browser?',
        answer: 'TensorFlow.js is a JavaScript library that brings machine learning to the browser. SafeOS runs it on WebGL, which uses your graphics chip. This means AI inference runs directly on your device, enabling real-time analysis without sending data to external servers.',
      },
      {
        question: 'Can I export my data?',
        answer: 'Yes. On the History page you can download a bundle of your settings, the alerts listed there, and saved frames. If you run the optional SafeOS server, the Export page downloads the data held on that server.',
      },
      {
        question: 'Who builds SafeOS, and why is it free?',
        answer: 'Frame (Framers Lab, Inc.) builds SafeOS and pays for its development. Using it costs nothing and needs no account.',
      },
      {
        question: 'How do I report bugs or request features?',
        answer: 'Report bugs and request features on our GitHub repository at github.com/framerslab/safeos. You can also reach the Frame.dev team directly at team@frame.dev.',
      },
    ],
  },
];

// =============================================================================
// Components
// =============================================================================

function FAQAccordion({
  question,
  answer,
  isOpen,
  onToggle
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-slate-700/50 last:border-0">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full py-4 text-left group"
        aria-expanded={isOpen}
      >
        <span className="font-medium text-white group-hover:text-emerald-400 transition-colors pr-4">
          {question}
        </span>
        <IconChevronDown
          size={20}
          className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[200rem] pb-4' : 'max-h-0'
        }`}
      >
        <p className="text-slate-300 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

function FAQCategorySection({ category }: { category: FAQCategory }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="mb-12">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-3">
        <span className="w-8 h-8 flex items-center justify-center bg-emerald-500/20 text-emerald-400 text-sm font-mono rounded-lg border border-emerald-500/30">
          {category.icon}
        </span>
        {category.name}
      </h3>
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
        {category.items.map((item, index) => (
          <FAQAccordion
            key={index}
            question={item.question}
            answer={item.answer}
            isOpen={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? null : index)}
          />
        ))}
      </div>
    </section>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter FAQs based on search
  const filteredCategories = searchQuery
    ? faqCategories
        .map((category) => ({
          ...category,
          items: category.items.filter(
            (item) =>
              item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.answer.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        }))
        .filter((category) => category.items.length > 0)
    : faqCategories;

  const totalQuestions = faqCategories.reduce(
    (acc, cat) => acc + cat.items.length,
    0
  );

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
                <h1 className="text-xl font-bold text-white">FAQ</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            Everything you need to know about SafeOS Guardian
          </p>

          {/* Search */}
          <div className="max-w-md mx-auto">
            <div className="relative">
              <IconSearch
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder={`Search ${totalQuestions} questions...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Categories */}
        {filteredCategories.length > 0 ? (
          filteredCategories.map((category, index) => (
            <FAQCategorySection key={index} category={category} />
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-4">
              No questions found matching &quot;{searchQuery}&quot;
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="text-emerald-400 hover:text-emerald-300"
            >
              Clear search
            </button>
          </div>
        )}

        <NotAMedicalDevice className="mt-4 text-sm text-slate-400 text-center max-w-2xl mx-auto" />

        {/* Still Have Questions? */}
        <section className="mt-16 text-center">
          <div className="p-8 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-2xl">
            <h3 className="text-xl font-semibold text-white mb-4">
              Still have questions?
            </h3>
            <p className="text-slate-400 mb-6">
              Can&apos;t find what you&apos;re looking for? We&apos;re here to help.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="mailto:team@frame.dev"
                className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                Email team@frame.dev
              </a>
              <a
                href="https://github.com/framerslab/safeos/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
              >
                Open GitHub Issue
              </a>
            </div>
          </div>
        </section>

        {/* Links */}
        <div className="mt-12 flex justify-center gap-4">
          <Link
            href="/about"
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
          >
            About SafeOS
          </Link>
          <Link
            href="/blog"
            className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
          >
            Read Our Blog
          </Link>
        </div>
      </main>
    </div>
  );
}
