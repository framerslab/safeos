/** The sections below the Guardian home hero. */

import Link from 'next/link';
import { IconBell, IconLock, IconMail, IconServer } from '@/components/icons';
import { NotAMedicalDevice } from '@/components/NotAMedicalDevice';
import { StartLink } from '@/components/visitor/StartLink';
import { shortCount, starCount, starWord } from '@/lib/github-stars';
import { SETUP_CAMERA_STEP, SETUP_STEP_COUNT } from '@/lib/setup-steps';
import { COCO_ANIMAL_CLASSES } from '@/lib/animal-kinds';
import { Brand } from './Brand';
import { UseStartLink } from './UseStartLink';
import { WayGlyph } from '@/components/dashboard/WaysToWatch';
import { Num } from '@/components/visitor/Num';

function LaptopGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="m4 16-2 4h20l-2-4" />
    </svg>
  );
}

const BENEFITS = [
  {
    title: 'Lo-tech and portable',
    text: 'Uses the camera and microphone of a phone, tablet or laptop you already own. Point it at any spot, indoors or out.',
    Glyph: LaptopGlyph,
  },
  {
    title: 'Supplemental alerts',
    text: 'When something moves or gets loud, the device that watches plays an alert sound, shows a notification and lists the alert in History.',
    Glyph: IconBell,
  },
  {
    title: 'Privacy first',
    text: 'Monitoring runs in the browser on the device that watches. Pictures and alerts stay in its storage, and go to a server only if you connect one you run.',
    Glyph: IconLock,
  },
];

export function HomeBenefits() {
  return (
    <section className="home-part" aria-labelledby="benefits-title">
      <div className="home-wrap">
        <h2 id="benefits-title" className="sr-only">What SafeOS is</h2>
        <ul className="home-benefits">
          {BENEFITS.map(({ title, text, Glyph }) => (
            <li key={title} className="home-benefit">
              <h3 className="home-h3"><span aria-hidden="true"><Glyph /></span>{title}</h3>
              <p className="home-p">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// =============================================================================
// What people set it up for
// =============================================================================

const useGlyphs = {
  crib: 'M3 8v12m18-12v12M3 17h18M6 8v9m4-9v9m4-9v9m4-9v9M3 8h18',
  armchair: 'M6 10V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3m-12 4h12m-13 5v2m14-2v2M4 10a2 2 0 0 1 2 2v2h12v-2a2 2 0 0 1 4 0v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z',
  pin: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
};

function UseGlyph({ kind }: { kind: keyof typeof useGlyphs }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={useGlyphs[kind]} />
    </svg>
  );
}

export function HomeUses() {
  return (
    <section id="uses" className="home-part" aria-labelledby="uses-title">
      <div className="home-wrap">
        <h2 id="uses-title" className="home-h2">
          What people set it up for
        </h2>
        <ul className="home-uses">
          <li className="home-use">
            <h3 id="baby-nap" className="home-h3">
              <span aria-hidden="true"><UseGlyph kind="crib" /></span>
              A baby’s nap
            </h3>
            <p className="home-p">
              Motion and loud-sound alerts for a short nap while you are close by. It reacts to movement and noise in
              the room.
            </p>
            <NotAMedicalDevice className="home-use__medical" />
            <UseStartLink wayId="monitor" setupLabel="Set it up for a nap" />
          </li>
          <li className="home-use">
            <h3 id="pet-out" className="home-h3">
              <span aria-hidden="true"><WayGlyph way="lost-found" /></span>
              A pet while you are out
            </h3>
            <p className="home-p">
              Leave it watching for a short while. It can play a sound you recorded when it sees motion, and History
              lists each alert for when you are back.
            </p>
            <UseStartLink wayId="monitor" setupLabel="Set it up for your pet" />
          </li>
          <li className="home-use">
            <h3 id="elderly-parent" className="home-h3">
              <span aria-hidden="true"><UseGlyph kind="armchair" /></span>
              An elderly parent
            </h3>
            <p className="home-p">
              Set it up together, with their agreement. It alerts in the room on motion, a loud sound or a set time of
              stillness. It cannot tell why nothing has moved or whether someone needs help. Reaching your own phone
              takes a server you run.
            </p>
            <UseStartLink wayId="monitor" setupLabel="Set it up together" />
          </li>
          <li className="home-use">
            <h3 id="lost-pet" className="home-h3">
              <span aria-hidden="true"><UseGlyph kind="pin" /></span>
              A lost pet near home
            </h3>
            <p className="home-p">
              Point a camera at the yard or the porch. <Brand>SafeOS</Brand> compares what it sees with the colours and
              shape in your pet’s photos and alerts on a possible sighting. It cannot tell your pet from a look-alike,
              so post an alert on <a href="https://www.pawboost.com/" translate="no">PawBoost</a> or{' '}
              <a href="https://lost.petcolove.org/" translate="no">Petco Love Lost</a> too.
            </p>
            <UseStartLink wayId="lost-found" setupLabel="Set it up for a lost pet" />
          </li>
          <li className="home-use">
            <h3 id="wildlife" className="home-h3">
              <span aria-hidden="true"><WayGlyph way="wildlife" /></span>
              Backyard wildlife
            </h3>
            <p className="home-p">
              The Wildlife page uses an object-detection model to spot <Num>{COCO_ANIMAL_CLASSES.length}</Num> kinds of animal,
              birds, cats and dogs among them. It saves a picture of each sighting in your browser.
            </p>
            <UseStartLink wayId="wildlife" setupLabel="Set it up for wildlife" />
          </li>
        </ul>
      </div>
    </section>
  );
}

// =============================================================================
// How it works
// =============================================================================

export function HomeHow({ siteAddress }: { siteAddress: string }) {
  return (
    <section id="one-device" className="home-part" aria-labelledby="how-title">
      <div className="home-wrap">
        <h2 id="how-title" className="home-h2">
          One device does the watching and the alerting
        </h2>
        <div className="home-how">
          <ol className="home-steps">
            <li className="home-step">
              <span className="home-step__numeral" aria-hidden="true">
                1
              </span>
              <div>
                <h3 className="home-h3">Open safeos.sh on the device that will watch.</h3>
                <p className="home-p">
                  An old phone, a tablet or a laptop works. Plug it in and set its screen to stay on, because a device
                  that sleeps stops watching.
                </p>
                <Link className="link-row" href="/faq/">See the browser list in the FAQ</Link>
              </div>
            </li>
            <li className="home-step">
              <span className="home-step__numeral" aria-hidden="true">
                2
              </span>
              <div>
                <h3 className="home-h3">Go through setup.</h3>
                <p className="home-p">
                  It has <Num>{SETUP_STEP_COUNT}</Num> short steps. You say what you are watching, and at step <Num>{SETUP_CAMERA_STEP}</Num>{' '}
                  the browser asks for the camera and microphone.
                </p>
              </div>
            </li>
            <li className="home-step">
              <span className="home-step__numeral" aria-hidden="true">
                3
              </span>
              <div>
                <h3 className="home-h3">Stay within earshot.</h3>
                <p className="home-p">
                  When something moves or gets loud, the device plays an alert sound, shows a notification and lists
                  the alert in History.
                </p>
              </div>
            </li>
          </ol>

          <figure className="home-qr">
            {/* A plain image: the file is made when the site is built (scripts/generate-site-qr.mjs). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/home/site-qr.svg"
              alt={`QR code for ${siteAddress}`}
              width={200}
              height={200}
              loading="lazy"
              decoding="async"
            />
            <figcaption>Scan to open safeos.sh on the phone or tablet that will watch.</figcaption>
          </figure>

          <div className="home-how__note">
            <h3 className="home-h3">What a server you run adds</h3>
            <p className="home-p">
              safeos.sh shows the camera and sounds the alert only on the device that is watching. A server you run adds:
            </p>
            <ul className="home-server__list">
              <li><span aria-hidden="true"><IconMail /></span>Email, text and Telegram alerts, from the server’s own look at the frames</li>
              <li><span aria-hidden="true"><IconServer /></span>Descriptions of frames by a model on the server, or a hosted model when you give it a key</li>
            </ul>
            <a className="link-row" href="https://github.com/framerslab/safeos/blob/master/docs/DEPLOYMENT.md#option-b-full-stack-deployment">
              <span>
                Read the server guide on <Brand>GitHub</Brand>
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Free and open source
// =============================================================================

export function HomeFree() {
  const stars = starCount();
  return (
    <section id="free" className="home-part home-band" aria-labelledby="free-title">
      <div className="home-wrap home-free">
        <h2 id="free-title" className="home-h2">
          Free on safeos.sh, with the code in the open
        </h2>
        <div className="home-free__words">
          <p className="home-p">
            <Brand>SafeOS</Brand> at safeos.sh is free, and this site has no paid tier or subscription.{' '}
            <a href="https://frame.dev" translate="no">Frame</a> builds <Brand>SafeOS</Brand> and pays for it.
          </p>
          <p className="home-p">The code is MIT-licensed, so anyone can read it, change it and run it.</p>
          <p className="home-p">
            <Brand>SafeOS</Brand> is experimental software, provided as is.
          </p>
          <p className="home-p">No account: open safeos.sh on the device that will watch and go through setup.</p>
          <p className="home-p">
            Frame also makes <a href="https://agentos.sh" translate="no">AgentOS</a> and{' '}
            <a href="https://paracosm.agentos.sh" translate="no">Paracosm</a>.
          </p>
        </div>
        <div className="home-free__actions">
          <a className="home-use__key home-free__key" href="https://github.com/framerslab/safeos">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
              <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.9.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.32.68.92.68 1.85v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
            </svg>
            <span>View on <Brand>GitHub</Brand></span>
            {stars && <span className="home-free__stars"><Num>{shortCount(stars.count)}</Num><span className="sr-only"> {starWord(stars.count)}</span></span>}
            <span>MIT License</span>
          </a>
          <ul className="home-links home-free__links">
            <li>
              <a className="link-row" href="https://github.com/framerslab/safeos/blob/master/LICENSE">
                The MIT License
              </a>
            </li>
            <li>
              <a className="link-row" href="https://github.com/framerslab/safeos/blob/master/apps/guardian-ui/scripts/check-offline-start.mjs">
                The offline check that runs before each deploy
              </a>
            </li>
            <li>
              <Link className="link-row" href="/blog/how-safeos-guardian-works/">
                <span>
                  How <Brand>SafeOS</Brand> works, in detail
                </span>
              </Link>
            </li>
            <li><Link className="link-row" href="/faq/">All questions and answers</Link></li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Closing block
// =============================================================================

export function HomeClosing() {
  return (
    <section className="home-part home-band" aria-labelledby="closing-title">
      <div className="home-wrap home-closing">
        <div className="home-closing__words">
          <h2 id="closing-title" className="home-h2">
            Start with the device you have
          </h2>
          <p className="home-p">
            Setup has <Num>{SETUP_STEP_COUNT}</Num> short steps and asks for the camera at step <Num>{SETUP_CAMERA_STEP}</Num>.
          </p>
        </div>
        <StartLink className="key key--solid key--start" arrow />
      </div>
    </section>
  );
}
