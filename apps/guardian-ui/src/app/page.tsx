/**
 * SafeOS Guardian - Home Page
 *
 * The page a first-time visitor reads before letting a browser tool use a
 * camera: what it is, a real capture of it watching a room, where it stops,
 * what sets off an alert and where the alert goes, then the way into setup.
 * Every word, link and picture is in the served HTML, so the page reads
 * before any script runs and when a script fails; nothing on it asks for a
 * permission, and it requests nothing from another company.
 *
 * @module app/page
 */
import type { Metadata } from 'next';
import { HomeCapture, type CaptureCrop } from '@/components/home/HomeCapture';
import { HomeStart } from '@/components/home/HomeStart';
import { HomeUses, HomeHow, HomeAlerts, HomeFree, HomeQuestions, HomeClosing } from '@/components/home/HomeSections';
import { Brand } from '@/components/home/Brand';
import { HOME_DESCRIPTION, HOME_TITLE, SITE_NAME, pageMetadata, socialImage } from '@/lib/page-metadata';
import { HOME_LAST_CHANGED } from '@/lib/page-last-changed';
import { captureSizes } from '@/lib/home-captures';
import { CAPTURE_PRELOAD_SCRIPT, CAPTURE_PRELOADS_SCRIPTS_OFF } from '@/lib/capture-preload';
import clip from '../../public/home/sample-clip.json';
import appPackage from '../../package.json';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh').replace(/\/+$/, '');
const REPOSITORY = 'https://github.com/framerslab/safeos';

export const metadata: Metadata = pageMetadata({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: '/',
});

// The three crops of the capture, each with its file's size and the words for
// what it shows. The sizes come from the capture's record and the words from
// the clip's record, so both change when the files do. A phone shows the
// monitor's camera view; a desktop a portrait crop with the monitor's
// readings; a tablet and the wide layout a landscape crop with the alert list.
const CAPTURE_SIZES = captureSizes();
const CAPTURE_CROPS: CaptureCrop[] = [
  { name: 'phone', ...CAPTURE_SIZES.phone, alt: clip.words.captureAlt.phone },
  { name: 'landscape', ...CAPTURE_SIZES.landscape, alt: clip.words.captureAlt.landscape },
  { name: 'portrait', ...CAPTURE_SIZES.portrait, alt: clip.words.captureAlt.portrait },
];

// React's own name for this attribute differs between versions; the HTML name works in all.
const HIGH_PRIORITY = { fetchpriority: 'high' } as Record<string, string>;

// The line for a page whose script did not start. This script running proves
// scripts are on, so it hides the line at once; if the app has not marked
// itself started five seconds later (its scripts blocked or failing), the
// line shows again. With scripts off this never runs and the line stays. An
// app that starts later hides the line through CSS.
const HIDE_NEEDS_SCRIPT = `(function(){var line=document.getElementById('home-needs-script');if(!line)return;var root=document.documentElement;line.hidden=true;setTimeout(function(){if(root.getAttribute('data-app-started')==='true')return;line.hidden=false},5000)})();`;

/** What the page says, for a search engine: the app and who builds it. */
function structuredData() {
  const card = socialImage();
  const webApplication = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: HOME_DESCRIPTION,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any, in a web browser',
    browserRequirements: 'Requires JavaScript and a camera; a microphone adds sound alerts',
    softwareVersion: appPackage.version,
    dateModified: HOME_LAST_CHANGED,
    isAccessibleForFree: true,
    license: `${REPOSITORY}/blob/master/LICENSE`,
    image: `${SITE_URL}${card.url}`,
    featureList: [
      'Motion alerts from the camera of a phone, tablet or laptop',
      'Loud-sound alerts from its microphone',
      'Stillness alerts after a time you set',
      'An alert sound, a notification and a History entry on the device that watches',
      'Motion and sound alerts with no connection, once the browser has saved the app',
      'An object-detection model for people and animals on the Security and Wildlife pages',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    publisher: { '@id': 'https://frame.dev/#organization' },
  };
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://frame.dev/#organization',
    name: 'Frame',
    url: 'https://frame.dev',
    email: 'team@frame.dev',
    sameAs: [REPOSITORY, 'https://agentos.sh', 'https://paracosm.agentos.sh', 'https://wilds.ai/discord'],
  };
  return [webApplication, organization];
}

export default function HomePage() {
  return (
    <main className="home">
      {structuredData().map((block) => (
        <script
          key={block['@type']}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
      {/* The capture for the width in the look that is on is asked for early;
          with scripts off, the device's own look. */}
      <script dangerouslySetInnerHTML={{ __html: CAPTURE_PRELOAD_SCRIPT }} />
      <noscript>
        {CAPTURE_PRELOADS_SCRIPTS_OFF.map(({ crop, look, media }) => (
          <link
            key={`${crop}-${look}`}
            rel="preload"
            as="image"
            type="image/webp"
            href={`/home/capture-${crop}-${look}.webp`}
            media={media}
            {...HIGH_PRIORITY}
          />
        ))}
      </noscript>

      <section className="home-first" aria-labelledby="home-headline">
        <div className="home-wrap home-first__grid">
          <div className="home-first__text">
            <h1 id="home-headline" className="home-headline">
              {HOME_TITLE}
            </h1>
            <p className="home-lead">
              <Brand>SafeOS Guardian</Brand> runs in your browser. The device watching the room sounds the alert when
              something moves or gets loud.
            </p>
          </div>

          <HomeCapture
            crops={CAPTURE_CROPS}
            caption={
              <>
                <Brand>SafeOS</Brand> watching a recorded clip of a kitten. Captured from the app while it ran.
              </>
            }
          />

          <div className="home-first__start">
            <HomeStart />
            <p className="home-statement">
              <Brand>SafeOS</Brand> adds an alert. It does not replace a person nearby. A phone or a browser can sleep,
              lose power or drop the camera, so stay within reach.
            </p>
            <p id="home-needs-script" className="home-needs-script">
              Setup needs JavaScript. The rest of this page reads without it.
            </p>
            <script dangerouslySetInnerHTML={{ __html: HIDE_NEEDS_SCRIPT }} />
          </div>
        </div>
      </section>

      <div className="home-wrap">
        <div className="tick-rule" aria-hidden="true" />
      </div>
      <HomeUses />
      <div className="home-wrap">
        <div className="tick-rule" aria-hidden="true" />
      </div>
      <HomeHow siteAddress={`${SITE_URL}/`} />
      <div className="home-wrap">
        <div className="tick-rule" aria-hidden="true" />
      </div>
      <HomeAlerts />
      <HomeFree />
      <HomeQuestions />
      <HomeClosing />
    </main>
  );
}
