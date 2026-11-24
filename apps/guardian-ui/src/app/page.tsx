/**
 * SafeOS Guardian - Home Page
 *
 * The page a first-time visitor reads before letting a browser tool use a
 * camera: what it is, recorded runs of it watching a room, where it stops,
 * what sets off an alert and where the alert goes, then the way into setup.
 * The words, links and first poster are in the served HTML, so the page reads
 * before any script runs and when a script fails; nothing on it asks for a
 * permission, and it requests nothing from another company.
 *
 * @module app/page
 */
import type { Metadata } from 'next';
import { HomeRuns } from '@/components/home/HomeRuns';
import { HomeDetection } from '@/components/home/HomeDetection';
import { HomeStart } from '@/components/home/HomeStart';
import { HomeBenefits, HomeUses, HomeHow, HomeFree, HomeClosing } from '@/components/home/HomeSections';
import { Brand, HomeLockup } from '@/components/home/Brand';
import { HOME_DESCRIPTION, HOME_TITLE, SITE_NAME, pageMetadata, socialImage } from '@/lib/page-metadata';
import { HOME_LAST_CHANGED } from '@/lib/page-last-changed';
import { dashboardPreloadScript } from '@/lib/capture-preload';
import type { HomeRunManifest } from '@/lib/home-runs';
import recording from '../../public/home/runs/runs.json';
import appPackage from '../../package.json';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh').replace(/\/+$/, '');
const REPOSITORY = 'https://github.com/framerslab/safeos';

export const metadata: Metadata = pageMetadata({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: '/',
});

const RECORD = recording as unknown as HomeRunManifest;

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
      'An alert sound, a notification if the browser allows it and a History entry on the device that watches',
      'Motion and sound alerts with no connection, once the browser has saved the app',
      'An object-detection model for people and animals on the People and Wildlife pages',
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
      <script dangerouslySetInnerHTML={{ __html: dashboardPreloadScript(RECORD.runs[0]) }} />
      <noscript>
        <style>{'.home-run__first-poster { background-image: var(--run-poster); }'}</style>
      </noscript>

      <section className="home-first" aria-labelledby="home-headline">
        <div className="home-wrap home-first__grid">
          <div className="home-first__text">
            <HomeLockup />
            <h1 id="home-headline" className="home-headline">
              {HOME_TITLE}
            </h1>
          </div>

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

          <HomeRuns runs={RECORD.runs} />
        </div>
      </section>

      <div className="home-wrap">
        <div className="tick-rule" aria-hidden="true" />
      </div>
      <HomeBenefits />
      <HomeDetection />
      <div className="home-wrap">
        <div className="tick-rule" aria-hidden="true" />
      </div>
      <HomeHow siteAddress={`${SITE_URL}/`} />
      <HomeUses />
      <div className="home-wrap">
        <div className="tick-rule" aria-hidden="true" />
      </div>
      <HomeFree />
      <HomeClosing />
    </main>
  );
}
