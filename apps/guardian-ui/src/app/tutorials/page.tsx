'use client';

/**
 * Tutorials Page
 * 
 * Comprehensive step-by-step guides for all SafeOS Guardian features.
 * 
 * @module app/tutorials/page
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  IconChevronLeft,
  IconChevronDown,
  IconBaby,
  IconPaw,
  IconShield,
  IconSearch,
  IconSettings,
  IconCamera,
  IconBell,
  IconDatabase,
  IconWildlife,
  IconBookOpen,
} from '../../components/icons';
import { NotAMedicalDevice } from '../../components/NotAMedicalDevice';

// =============================================================================
// Types
// =============================================================================

interface TutorialSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  steps: TutorialStep[];
}

interface TutorialStep {
  title: string;
  content: string;
  tips?: string[];
}

// =============================================================================
// Tutorial Content
// =============================================================================

const TUTORIALS: TutorialSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: <IconCamera size={24} />,
    description: 'Learn the basics of setting up SafeOS Guardian for the first time.',
    steps: [
      {
        title: 'Welcome to SafeOS Guardian',
        content: `SafeOS Guardian is a browser-based monitoring system that helps you watch over loved ones, pets, and property. Monitoring runs in your browser. Nothing is uploaded unless you connect a server you run yourself; Security and Wildlife download their detection model from Google model storage after you agree.`,
        tips: [
          'Needs a browser with camera access and IndexedDB: current Chrome, Edge, Firefox and Safari have both',
          'Ensure camera and microphone permissions are granted',
          'Settings and saved frames stay in your browser\'s storage',
        ],
      },
      {
        title: 'Camera Setup',
        content: `When you first start monitoring, your browser will request camera access. Position your camera to capture the area you want to monitor. For best results, ensure adequate lighting and a stable camera position.`,
        tips: [
          'Use a tripod or stable surface for your device',
          'Avoid pointing the camera at windows to prevent glare',
          'Test the camera view before leaving it unattended',
        ],
      },
      {
        title: 'Choosing a Monitoring Mode',
        content: `SafeOS Guardian offers several monitoring modes optimized for different scenarios: Baby/Infant monitoring, Pet monitoring, Elderly care, Security/Intrusion detection, and Lost & Found tracking.`,
        tips: [
          'Each mode has pre-configured sensitivity settings',
          'You can customize settings after selecting a mode',
          'Switch modes anytime from the dashboard',
        ],
      },
      {
        title: 'Understanding Alerts',
        content: `When motion, sound, or other triggers are detected, SafeOS Guardian will alert you through sound, browser notifications, and visual indicators. You can customize alert sensitivity and volume in settings.`,
        tips: [
          'Grant notification permissions for browser alerts',
          'Keep your device volume up for audio alerts',
          'Check the alert history to review past events',
        ],
      },
    ],
  },
  {
    id: 'baby-monitoring',
    title: 'Baby & Infant Monitoring',
    icon: <IconBaby size={24} />,
    description: 'Optimized settings for monitoring sleeping infants with ultra-sensitive detection.',
    steps: [
      {
        title: 'Setting Up Baby Monitoring',
        content: `Baby monitoring mode uses ultra-low detection thresholds to catch even the slightest movement or sound. This is ideal for monitoring sleeping infants.`,
        tips: [
          'Position camera to see the entire crib/bed area',
          'Keep the phone or laptop and its cable well out of reach of the crib',
          'Turn on sound alerts: they go off when sound, such as crying, stays loud',
        ],
      },
      {
        title: 'Motion Detection for Infants',
        content: `The infant sleep preset uses a 5-pixel absolute threshold, so even tiny movements, such as stirring or waking, raise an alert.`,
        tips: [
          'Reduce background movement (fans, curtains)',
          'Close doors to prevent pets from triggering alerts',
          'Use the "Processing Mode: Local" for instant alerts',
        ],
      },
      {
        title: 'Sound Alerts',
        content: `Sound alerts go off when the sound level stays above your threshold. A crying pattern shows in the camera overlay, but it does not raise an alert on its own.`,
        tips: [
          'Calibrate in a quiet environment first',
          'White noise machines may affect detection',
          'Adjust sensitivity based on your baby\'s typical sounds',
        ],
      },
      {
        title: 'Session Timer',
        content: `Monitoring sessions have a maximum duration of 24 hours. You must re-arm the monitoring at least once per day. This ensures someone is actively checking on the system.`,
        tips: [
          'Set a reminder to check and re-arm monitoring',
          'The timer shows countdown in the header',
          'You can extend sessions before they expire',
        ],
      },
    ],
  },
  {
    id: 'pet-monitoring',
    title: 'Pet Monitoring',
    icon: <IconPaw size={24} />,
    description: 'Keep an eye on your pet while you are briefly out of the room, with motion and sound alerts.',
    steps: [
      {
        title: 'Pet Monitoring Overview',
        content: `Pet monitoring mode is set for the typical movement and sound levels of household pets. It alerts on motion and on loud sound. Use it for short absences, never to leave a pet alone for long.`,
        tips: [
          'Position camera to cover pet\'s main activity areas',
          'Include food/water bowls in the camera view',
          'Consider multiple cameras for larger homes',
        ],
      },
      {
        title: 'Sound Alerts for Pets',
        content: `The sound alert measures loudness: it goes off when sound stays above your threshold, whatever made it. You can adjust sensitivity based on your pet\'s typical behavior.`,
        tips: [
          'Dogs: a higher threshold suits vocal breeds',
          'Cats: a lower threshold may work better for quieter cats',
          'Test the threshold while your pet behaves normally',
        ],
      },
      {
        title: 'Alert History',
        content: `Alerts are saved in your browser and listed in History, so you can see when your pet moved or made noise while you were out of the room.`,
        tips: [
          'Check History after a short absence',
          'Acknowledged alerts stay in History',
        ],
      },
    ],
  },
  {
    id: 'security-mode',
    title: 'Security & Intrusion Detection',
    icon: <IconShield size={24} />,
    description: 'Person detection with an alert when more people are in view than you allow.',
    steps: [
      {
        title: 'Security Mode Overview',
        content: `Security mode runs the COCO-SSD model in your browser to count the people in view. You set how many people are allowed, and it alerts when more are detected.`,
        tips: [
          'Works best with clear camera angles',
          'AI detection requires a moment to initialize',
          'Consider privacy laws when recording others',
        ],
      },
      {
        title: 'Configuring Allowed Persons',
        content: `Set the number of people normally present in the monitored area. If more people are detected, the system will trigger an alert. Set to 0 for areas that should always be empty.`,
        tips: [
          'Account for regular visitors and family members',
          'Use 0 for vacation mode or empty-house monitoring',
          'Adjust for different times of day if needed',
        ],
      },
      {
        title: 'Alert Modes: Loud vs Silent',
        content: `Choose between extreme alerts (loud alarms, TTS warnings) or silent mode (just saves frames for later review). Extreme mode includes browser TTS speaking warning messages.`,
        tips: [
          'Extreme mode sounds an alarm and speaks a warning',
          'Silent mode saves frames without an alarm',
          'Both modes save frames in your browser',
        ],
      },
      {
        title: 'Reviewing Intrusion Frames',
        content: `All detected intrusions are saved as frames with timestamps. You can review, export, and delete these frames from the Intrusion Gallery.`,
        tips: [
          'Export frames as evidence if needed',
          'Regularly clean up old acknowledged frames',
          'Add notes to important detections',
        ],
      },
    ],
  },
  {
    id: 'lost-found',
    title: 'Lost Pet Watch Mode',
    icon: <IconSearch size={24} />,
    description: 'Upload photos of your lost pet and get an alert when an animal with the same colouring passes your camera.',
    steps: [
      {
        title: 'How Lost & Found Works',
        content: `Upload reference photos of your lost pet. SafeOS records their colours, a coarse edge grid and size. While the monitor is open, it compares your camera's frames with them. It matches colours, so it cannot tell your pet from another animal of similar colour.`,
        tips: [
          'Upload multiple photos from different angles',
          'Include photos in different lighting conditions',
          'Clear, well-lit photos work best',
        ],
      },
      {
        title: 'Adding Your Pet',
        content: `Give your pet a name and add a description with identifying features. Upload 3 to 5 clear reference photos.`,
        tips: [
          'Include distinctive markings or features',
          'Note collar colors',
          'Describe size and build in the description',
        ],
      },
      {
        title: 'Sensitivity Settings',
        content: `Adjust the confidence threshold for alerts and recording. Higher thresholds mean fewer false positives but might miss real matches. Lower thresholds are more sensitive but may have false alarms.`,
        tips: [
          'Start with default 70% for alerts',
          'Lower to 50-60% if missing real matches',
          'Review recorded frames to tune settings',
        ],
      },
      {
        title: 'Custom Media Alerts',
        content: `Upload custom images and audio files to play when a match is detected. You can also configure TTS messages to speak repeatedly. This can help attract the attention of a lost pet.`,
        tips: [
          'Record your voice calling the pet\'s name',
          'Use familiar sounds that the pet responds to',
          'Set playback to loop or repeat X times',
        ],
      },
      {
        title: 'No Session Timer',
        content: `Unlike regular monitoring modes, Lost & Found mode has no mandatory session timer. It can run for as long as the page stays open.`,
        tips: [
          'Check periodically to ensure the system is running',
          'Monitor browser resource usage for long sessions',
          'Consider running on a dedicated device',
        ],
      },
    ],
  },
  {
    id: 'wildlife',
    title: 'Wildlife Detection',
    icon: <IconWildlife size={20} className="text-emerald-400" />,
    description: 'Detect ten kinds of animal and sort them by size and danger level.',
    steps: [
      {
        title: 'Wildlife Detection Overview',
        content: `Wildlife detection runs the COCO-SSD model in your browser. It knows ten kinds of animal: dogs, cats, birds, horses, sheep, cows, elephants, bears, zebras and giraffes. Each is given a size (small, medium, large) and a danger level.`,
        tips: [
          'It finds only those ten kinds of animal',
          'Larger animals may be detected from further away',
          'Good light helps',
        ],
      },
      {
        title: 'Size Categories',
        content: `Cats and birds are small, dogs and sheep medium, and horses, cows, bears, elephants, zebras and giraffes large. You can filter sightings by size.`,
        tips: [
          'Large-animal alerts are on by default',
          'Filter out small animals in busy areas',
          'Cats are small and dogs are medium',
        ],
      },
      {
        title: 'Danger Levels',
        content: `Each animal is given a danger level: none, low, medium, high, or extreme. A bear is extreme and an elephant high; they raise the most urgent alerts.`,
        tips: [
          'The alert sound gets more urgent with the danger level',
          'Voice alerts name the animal',
          'Low/none uses standard notification sounds',
        ],
      },
    ],
  },
  {
    id: 'data-storage',
    title: 'Data & Privacy',
    icon: <IconDatabase size={24} />,
    description: 'Understanding how SafeOS stores data locally and protects your privacy.',
    steps: [
      {
        title: 'Local-First Storage',
        content: `Settings are stored in your browser\'s localStorage, and saved frames and photos in its IndexedDB. Nothing is uploaded unless you connect a server you run yourself. This means your saved frames and settings are private but also only exist on your device.`,
        tips: [
          'Data is lost if you clear browser cache',
          'Export important data regularly',
          'Consider browser profiles for isolation',
        ],
      },
      {
        title: 'Preventing Data Loss',
        content: `To prevent data loss: 1) Don\'t clear browser cache/data, 2) Use the same browser profile, 3) Export important recordings, 4) Back up your browser profile folder.`,
        tips: [
          'Export intrusion and match frames regularly',
          'Settings are automatically saved',
          'Subject profiles persist in IndexedDB',
        ],
      },
      {
        title: 'Clearing Data',
        content: `To clear all SafeOS data, you can use the Clear Data button in Settings, or clear your browser\'s site data for this domain. This removes all recordings, settings, and profiles.`,
        tips: [
          'Clearing data cannot be undone',
          'Export anything important first',
          'Clearing may be required if storage is full',
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Advanced Settings',
    icon: <IconSettings size={24} />,
    description: 'Fine-tune detection thresholds, alerts, and processing modes.',
    steps: [
      {
        title: 'Processing Modes',
        content: `Local processing runs entirely in your browser for instant results. The other modes send frames to a server you run yourself, which can pass them to a vision model and adds a short delay.`,
        tips: [
          'Local mode needs no server',
          'The other modes need your own server',
          'Hybrid mode checks Lost & Found frames a little less often',
        ],
      },
      {
        title: 'Alert Configuration',
        content: `Configure alert volume, sound type, and browser notifications. Emergency mode maximizes volume and enables all alert types simultaneously.`,
        tips: [
          'Test alerts at different volume levels',
          'Enable browser notifications for background alerts',
          'TTS alerts speak warning messages aloud',
        ],
      },
      {
        title: 'Detection Thresholds',
        content: `Adjust pixel threshold, motion sensitivity, and audio sensitivity. Lower values are more sensitive but may cause false positives. Higher values reduce noise but may miss events.`,
        tips: [
          'Start with defaults and adjust based on results',
          'Lower thresholds catch smaller movements',
          'Higher thresholds for general surveillance',
        ],
      },
    ],
  },
];

// =============================================================================
// Components
// =============================================================================

interface AccordionProps {
  section: TutorialSection;
  isOpen: boolean;
  onToggle: () => void;
}

function TutorialAccordion({ section, isOpen, onToggle }: AccordionProps) {
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-4 bg-slate-800/50 hover:bg-slate-800 transition-colors text-left"
      >
        <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
          {section.icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">{section.title}</h3>
          <p className="text-sm text-slate-400">{section.description}</p>
        </div>
        <IconChevronDown
          size={20}
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      
      {isOpen && (
        <div className="p-4 space-y-6 bg-slate-900/50">
          {section.steps.map((step, index) => (
            <div key={index} className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold">
                {index + 1}
              </div>
              <div>
                <h4 className="font-medium text-white mb-2">{step.title}</h4>
                <p className="text-sm text-slate-300 leading-relaxed mb-3">
                  {step.content}
                </p>
                {step.tips && (
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-emerald-400 font-medium mb-2">Tips:</p>
                    <ul className="space-y-1">
                      {step.tips.map((tip, tipIndex) => (
                        <li key={tipIndex} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-emerald-500 mt-1">•</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function TutorialsPage() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['getting-started']));

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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
                <IconBookOpen size={22} className="text-emerald-400" />
                <h1 className="text-xl font-bold text-white">Tutorials &amp; Guides</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Introduction */}
        <div className="mb-8 text-center">
          <p className="text-slate-300 max-w-2xl mx-auto">
            Comprehensive guides to help you get the most out of SafeOS Guardian.
            Click on any section below to expand the detailed tutorials.
          </p>
          <NotAMedicalDevice className="mt-3 text-sm text-slate-400 max-w-2xl mx-auto" />
        </div>

        {/* Quick Links */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {TUTORIALS.map((section) => (
            <button
              key={section.id}
              onClick={() => {
                setOpenSections(new Set([section.id]));
                document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              {section.title}
            </button>
          ))}
        </div>

        {/* Tutorial Sections */}
        <div className="space-y-4">
          {TUTORIALS.map((section) => (
            <div key={section.id} id={section.id}>
              <TutorialAccordion
                section={section}
                isOpen={openSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
              />
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="mt-12 p-6 bg-slate-900 border border-slate-700 rounded-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-emerald-400 mb-1">Is my data private?</h3>
              <p className="text-sm text-slate-400">
                Yes. Settings and saved frames stay in your browser. Nothing is uploaded unless you connect a server you run yourself.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-emerald-400 mb-1">Does it work offline?</h3>
              <p className="text-sm text-slate-400">
                Yes, once the app has installed while online. Security and Wildlife also need their detection model downloaded and saved first.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-emerald-400 mb-1">What browsers are supported?</h3>
              <p className="text-sm text-slate-400">
                SafeOS needs camera access and IndexedDB: current Chrome, Edge, Firefox and Safari have both.
              </p>
            </div>
            <div>
              <h3 className="font-medium text-emerald-400 mb-1">How do I report a bug?</h3>
              <p className="text-sm text-slate-400">
                Visit our GitHub repository or contact us through the About page.
              </p>
            </div>
          </div>
        </div>

        {/* Need Help */}
        <div className="mt-8 text-center">
          <p className="text-slate-500 text-sm">
            Still need help?{' '}
            <Link href="/about" className="text-emerald-400 hover:text-emerald-300">
              Contact us
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}




























