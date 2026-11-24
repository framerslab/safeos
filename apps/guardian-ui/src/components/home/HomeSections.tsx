/**
 * The home page's parts below the first screen
 *
 * What people set it up for, how it works, what sets off an alert, free and
 * open source, the questions people ask first and the closing block. Every
 * part is plain text in the served HTML: nothing here waits for a script.
 * Counts and sizes are read from the code they describe (setup's steps, the
 * detector's animal list, the model's size, the stillness setting's bounds),
 * never typed into a sentence.
 *
 * @module components/home/HomeSections
 */

import Link from 'next/link';
import { IconBell, IconLock } from '@/components/icons';
import { NotAMedicalDevice } from '@/components/NotAMedicalDevice';
import { StartLink } from '@/components/visitor/StartLink';
import { SETUP_CAMERA_STEP, SETUP_STEP_COUNT } from '@/lib/setup-steps';
import { COCO_ANIMAL_CLASSES } from '@/lib/animal-kinds';
import { MODEL_SIZE_MB } from '@/lib/detection-model-facts';
import { STILLNESS_ALERT_MAX_MINUTES, STILLNESS_ALERT_MIN_MINUTES } from '@/lib/stillness-bounds';
import { Brand } from './Brand';
import { Num } from '@/components/visitor/Num';

/** "dog, cat, bird, … zebra and giraffe": the detector's own names, in its order. */
export const ANIMAL_KINDS = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' }).format(
  COCO_ANIMAL_CLASSES
);

const NBSP = ' ';

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
              A baby’s nap
            </h3>
            <p className="home-p">
              Motion and loud-sound alerts for a short nap while you are close by. It reacts to movement and noise in
              the room.
            </p>
            <NotAMedicalDevice className="home-use__medical" />
          </li>
          <li className="home-use">
            <h3 id="pet-out" className="home-h3">
              A pet while you are out
            </h3>
            <p className="home-p">
              Leave it watching for a short while. It can play a sound you recorded when it sees motion, and History
              lists each alert for when you are back.
            </p>
          </li>
          <li className="home-use">
            <h3 id="elderly-parent" className="home-h3">
              An elderly parent
            </h3>
            <p className="home-p">
              Set it up together, with their agreement. It alerts in the room on motion, a loud sound or a set time of
              stillness. It cannot tell why nothing has moved or whether someone needs help. Reaching your own phone
              takes a server you run.
            </p>
          </li>
          <li className="home-use">
            <h3 id="lost-pet" className="home-h3">
              A lost pet near home
            </h3>
            <p className="home-p">
              Point a camera at the yard or the porch. <Brand>SafeOS</Brand> compares what it sees with the colours in
              your pet’s photos and alerts on a likely match. It cannot tell your pet from a look-alike, so post an
              alert on <Brand>PawBoost</Brand> or <Brand>Petco Love Lost</Brand> too.
            </p>
            <ul className="home-links">
              <li>
                <a className="link-row" href="https://www.pawboost.com/" translate="no">
                  PawBoost
                </a>
              </li>
              <li>
                <a className="link-row" href="https://lost.petcolove.org/" translate="no">
                  Petco Love Lost
                </a>
              </li>
            </ul>
          </li>
          <li className="home-use">
            <h3 id="wildlife" className="home-h3">
              Backyard wildlife
            </h3>
            <p className="home-p">
              The Wildlife page uses an object-detection model to spot <Num>{COCO_ANIMAL_CLASSES.length}</Num> kinds of animal,
              birds, cats and dogs among them. It saves a picture of each sighting in your browser.
            </p>
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
            <p className="home-p">
              Want the alert on another phone? Email, text and Telegram alerts need a server you run yourself.
            </p>
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
// What sets off an alert
// =============================================================================

export function HomeAlerts() {
  return (
    <section id="alerts" className="home-part" aria-labelledby="alerts-title">
      <div className="home-wrap home-alerts">
        <h2 id="alerts-title" className="home-h2">
          Four things set off an alert
        </h2>
        <ul className="home-alerts__list">
          <li className="home-alert">
            <h3 className="home-h3">Motion</h3>
            <p className="home-p">The camera picture changes by more than the amount you set.</p>
          </li>
          <li className="home-alert">
            <h3 className="home-h3">A loud sound</h3>
            <p className="home-p">The microphone level stays above the level you set.</p>
          </li>
          <li className="home-alert">
            <h3 className="home-h3">Stillness</h3>
            <p className="home-p">
              Nothing has moved for a time you set, from <Num>{STILLNESS_ALERT_MIN_MINUTES}</Num> to <Num>{STILLNESS_ALERT_MAX_MINUTES}</Num>{' '}
              minutes.
            </p>
          </li>
          <li className="home-alert">
            <h3 className="home-h3">A person or an animal</h3>
            <p className="home-p">
              The Security and Wildlife pages run an object-detection model in your browser. It finds people and{' '}
              <Num>{COCO_ANIMAL_CLASSES.length}</Num> kinds of animal: {ANIMAL_KINDS}.
            </p>
            <p className="home-p">
              That model is <Num>{MODEL_SIZE_MB}</Num>
              {NBSP}MB, downloaded from <Brand>Google</Brand>’s storage. The download starts only after you agree, and{' '}
              <Brand>Google</Brand> sees your IP address when it does.
            </p>
          </li>
        </ul>
        <div className="home-alerts__aside">
          <p className="home-p">
            The everyday monitor compares each camera frame with the one before and measures how loud the room is.
          </p>
          <a className="link-row" href="https://github.com/framerslab/safeos/tree/master/apps/guardian-ui/src/lib">
            <span>
              Read the detection code on <Brand>GitHub</Brand>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Free and open source
// =============================================================================

export function HomeFree() {
  return (
    <section id="free" className="home-part home-band" aria-labelledby="free-title">
      <div className="home-wrap home-free">
        <h2 id="free-title" className="home-h2">
          Free on safeos.sh, with the code in the open
        </h2>
        <div className="home-free__words">
          <p className="home-p">
            <Brand>SafeOS</Brand> at safeos.sh is free, and this site has no paid tier or subscription.{' '}
            <Brand>Frame</Brand> builds <Brand>SafeOS</Brand> and pays for it.
          </p>
          <p className="home-p">The code is MIT-licensed, so anyone can read it, change it and run it.</p>
          <p className="home-p">
            <Brand>SafeOS</Brand> is experimental software, provided as is.
          </p>
        </div>
        <ul className="home-links home-free__links">
          <li>
            <a className="link-row" href="https://github.com/framerslab/safeos">
              <span>
                Read the code on <Brand>GitHub</Brand>
              </span>
            </a>
          </li>
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
        </ul>
      </div>
    </section>
  );
}

// =============================================================================
// Questions people ask first
// =============================================================================

function Question({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="home-q">
      <summary>
        <span>{question}</span>
        <span className="home-q__mark" aria-hidden="true" />
      </summary>
      <div className="home-q__answer">{children}</div>
    </details>
  );
}

export function HomeQuestions() {
  return (
    <section id="questions" className="home-part" aria-labelledby="questions-title">
      <div className="home-wrap home-questions">
        <h2 id="questions-title" className="home-h2">
          Questions people ask first
        </h2>
        <div className="home-questions__group home-questions__group--first">
          <Question question="Can an old phone be the camera?">
            <p className="home-p">
              Yes. <Brand>SafeOS</Brand> runs in the browser on phones, tablets and computers. Plug the device in and
              set its screen to stay on, because a device that sleeps stops watching. The FAQ lists the browsers.
            </p>
            <Link className="link-row" href="/faq/">
              See the browser list in the FAQ
            </Link>
          </Question>
          <Question question="Where does the alert go?">
            <p className="home-p">
              To the device that is watching. It plays a sound, shows a notification and lists the alert in History.
              Email, text and Telegram alerts need a server you run yourself.
            </p>
          </Question>
          <Question question="Can I see the camera from another device?">
            <p className="home-p">No. safeos.sh shows the camera only on the device that is watching.</p>
          </Question>
        </div>
        <div className="home-questions__group home-questions__group--second">
          <Question question="Does it work without internet?">
            <p className="home-p">
              Yes, after your browser has saved the app’s files on a visit online. Motion and sound alerts then work
              with no connection. The Security and Wildlife pages also need their model saved first.
            </p>
          </Question>
          <Question question="Do I need an account?">
            <p className="home-p">No. Open safeos.sh on the device that will watch and go through setup.</p>
          </Question>
          <Question question="Where are my pictures kept?">
            <p className="home-p">
              In the browser on the device that watches. Saved frames, photos and alerts are kept in its storage, and
              they go to a server only if you connect one of your own.
            </p>
            <Link className="link-row" href="/privacy/">
              Read the privacy page
            </Link>
          </Question>
        </div>
        <Link className="link-row home-questions__all" href="/faq/">
          All questions and answers
        </Link>
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
