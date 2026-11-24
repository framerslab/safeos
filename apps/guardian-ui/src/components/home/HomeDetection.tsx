import Link from 'next/link';
import type { ReactNode } from 'react';
import { WayGlyph } from '@/components/icons/WayGlyph';
import { IconBell, IconCamera, IconDatabase, IconDownload, IconMail, IconMic, IconServer, IconVolume2 } from '@/components/icons';
import { Num } from '@/components/visitor/Num';
import { COCO_ANIMAL_CLASSES } from '@/lib/animal-kinds';
import { MAX_PET_PHOTOS, MIN_PET_PHOTOS } from '@/lib/pet-photo-limits';
import { STILLNESS_ALERT_MAX_MINUTES, STILLNESS_ALERT_MIN_MINUTES } from '@/lib/stillness-bounds';
import { MODEL_SIZE_MB } from '@/lib/detection-model-facts';
import { HomeBirdGlyph } from './Brand';

const modelSize = <><Num>{MODEL_SIZE_MB}</Num>{' '}MB</>;
const animals = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(COCO_ANIMAL_CLASSES);

interface DetectionCard {
  id: string;
  title: string;
  tags: readonly [ReactNode, ReactNode];
  glyph: ReactNode;
  summary: ReactNode;
  details: readonly ReactNode[];
  link?: { href: string; label: string };
}

const cards: DetectionCard[] = [
  {
    id: 'motion',
    title: 'Motion and stillness',
    tags: ['Frame comparison', 'No model'],
    glyph: <WayGlyph way="monitor" />,
    summary: 'The monitor compares each camera frame with the one before, five times a second, and alerts when the change passes the amount you set.',
    details: [
      <>It can also alert when nothing has moved for a time you set, from <Num>{STILLNESS_ALERT_MIN_MINUTES}</Num> to <Num>{STILLNESS_ALERT_MAX_MINUTES}</Num> minutes.</>,
    ],
  },
  {
    id: 'sound',
    title: 'Sound alerts',
    tags: ['Web Audio API', 'No model'],
    glyph: <IconVolume2 />,
    summary: 'The browser reads the microphone’s level ten times a second and alerts when it stays above the level you set.',
    details: [
      'An alert nobody acknowledges climbs five levels, each louder; the top level repeats until each alert at it is acknowledged.',
      'The five alert sounds are tones the browser makes, so they need no file and play offline.',
    ],
  },
  {
    id: 'people-animals',
    title: 'People and animals',
    tags: ['COCO-SSD on TensorFlow.js', <>{modelSize}, after you agree</>],
    glyph: <HomeBirdGlyph />,
    summary: 'The People and Wildlife pages run an object-detection model in your browser, on the graphics chip.',
    details: [
      <>It finds people and <Num>{COCO_ANIMAL_CLASSES.length}</Num> kinds of animal: {animals}.</>,
      'People checks up to twice a second and Wildlife once a second at most, each after its own motion check.',
      'The model downloads from Google’s storage only after you agree, and Google sees your IP address when it does. Your browser then keeps it, and both pages load it from there.',
    ],
  },
  {
    id: 'lost-found',
    title: 'Lost and Found',
    tags: ['Colour and outline', 'No model'],
    glyph: <WayGlyph way="lost-found" />,
    summary: <>Add <Num>{MIN_PET_PHOTOS}</Num> to <Num>{MAX_PET_PHOTOS}</Num> photos of your pet. The browser reads each photo’s colours, its <Num>5</Num> main colours, its outline on an <Num>8</Num> by <Num>8</Num> grid and its size, and compares parts of the camera’s picture with them twice a second.</>,
    details: [
      'It alerts when a part of the picture has colours and shape like your pet’s photos, so you can look and compare.',
      'Another animal, or something of a similar colour, can raise it too.',
    ],
  },
  {
    id: 'offline',
    title: 'Works offline once saved',
    tags: ['Installable web app', 'Service worker'],
    glyph: <IconDownload />,
    summary: 'Open safeos.sh once online and the browser saves the app’s files.',
    details: [
      'Motion and sound alerts then work with no connection, and People and Wildlife once their model is saved.',
      'Clearing the browser’s storage removes the saved copy; the next visit online saves it again.',
    ],
  },
  {
    id: 'storage',
    title: 'What stays on your device',
    tags: ['IndexedDB', 'localStorage'],
    glyph: <IconDatabase />,
    summary: 'Frames are compared in your browser. Settings, alerts, your pet’s photos and the frames a page saves stay in this browser’s storage.',
    details: [
      'Settings sit in localStorage; alerts, saved frames and your pet’s photos in IndexedDB; the model in Cache Storage.',
    ],
    link: { href: '/privacy/', label: 'Read the privacy page' },
  },
];

function DetectionCards() {
  const group = { name: 'home-detection' } as Record<string, string>;
  return (
    <div className="home-detection__cards">
      {cards.map(({ id, title, tags, glyph, summary, details, link }) => (
        <details key={id} className="home-detection__card" data-card={id} {...group}>
          <summary>
            <span className="home-detection__glyph" aria-hidden="true">{glyph}</span>
            <h3 className="home-h3">{title}</h3>
            <span className="home-detection__tags">{tags[0]} · {tags[1]}</span>
            <span className="home-p home-detection__summary">{summary}</span>
            <span className="home-q__mark" aria-hidden="true" />
          </summary>
          <div className="home-detection__body">
            {details.map((line, i) => <p className="home-p" key={i}>{line}</p>)}
            {link && <Link className="link-row" href={link.href}>{link.label}</Link>}
          </div>
        </details>
      ))}
    </div>
  );
}

interface DiagramNode {
  id: string;
  name: string;
  detail?: ReactNode;
  glyph: ReactNode;
  sources?: readonly string[];
}

const inputs: DiagramNode[] = [
  { id: 'camera', name: 'Camera', glyph: <IconCamera /> },
  { id: 'microphone', name: 'Microphone', glyph: <IconMic /> },
  { id: 'pet-photos', name: 'Your pet’s photos', glyph: <WayGlyph way="lost-found" /> },
];

const checks: DiagramNode[] = [
  {
    id: 'motion',
    name: 'Motion',
    detail: <>frames compared <Num>5</Num> times a second</>,
    glyph: <WayGlyph way="monitor" />,
    sources: ['camera'],
  },
  {
    id: 'picture-change',
    name: 'Picture change',
    detail: <>changed pixels counted <Num>5</Num> times a second</>,
    glyph: <IconCamera />,
    sources: ['camera'],
  },
  {
    id: 'sound',
    name: 'Sound level',
    detail: <>read <Num>10</Num> times a second</>,
    glyph: <IconMic />,
    sources: ['microphone'],
  },
  {
    id: 'lost-found',
    name: 'Lost and Found',
    detail: 'colours and outline compared twice a second',
    glyph: <WayGlyph way="lost-found" />,
    sources: ['camera', 'pet-photos'],
  },
  {
    id: 'people-wildlife',
    name: 'People and Wildlife',
    detail: <>COCO-SSD on TensorFlow.js, run on the graphics chip, {modelSize}, saved after you agree</>,
    glyph: <HomeBirdGlyph />,
    sources: ['camera'],
  },
];

const outputs: DiagramNode[] = [
  {
    id: 'alert',
    name: 'The alert',
    detail: 'a sound, a notification and a line in History',
    glyph: <IconBell />,
    sources: checks.map(({ id }) => id),
  },
  {
    id: 'storage',
    name: 'Kept in this browser',
    detail: 'settings, alerts, saved frames, your pet’s photos and the model',
    glyph: <IconDatabase />,
  },
];

const server: DiagramNode[] = [
  { id: 'server-frames', name: 'Frames from the Motion and sound page', glyph: <IconCamera /> },
  { id: 'server-alerts', name: 'Email, text and Telegram alerts from the server’s own look at the frames', glyph: <IconMail /> },
  { id: 'server-model', name: 'A model on your server, or a hosted one when you give it a key', glyph: <IconServer /> },
];

function DiagramBand({ nodes, from = [] }: { nodes: DiagramNode[]; from?: DiagramNode[] }) {
  return (
    <ul className="home-diagram__band" role="list" style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}>
      {nodes.map(({ id, name, detail, glyph, sources }) => (
        <li key={id} className="home-diagram__node" data-node={id}>
          <span className="home-diagram__glyph" aria-hidden="true">{glyph}</span>
          <span className="home-diagram__node-label">{name}{detail && <>: {detail}</>}</span>
          {sources && (
            <span className={from === checks ? 'home-diagram__inputs sr-only' : 'home-diagram__inputs'}>
              <span className="sr-only">From </span>
              {sources.map((source) => from.find((node) => node.id === source)?.name).join(' · ')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function DiagramWires({ from, to }: { from: DiagramNode[]; to: DiagramNode[] }) {
  const anchor = (index: number, count: number) => (index + 0.5) * 300 / count;
  return (
    <svg className="home-diagram__wires" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {to.flatMap((target, i) => (target.sources ?? []).map((source) => {
        const start = anchor(from.findIndex(({ id }) => id === source), from.length);
        const end = anchor(i, to.length);
        return (
          <path key={`${source}-${target.id}`} aria-hidden="true" data-from={source} data-to={target.id}
            d={`M ${start} 0 V 4 L ${end} 25 V 29 M ${end - 1.5} 25 L ${end} 29 L ${end + 1.5} 25`}
            vectorEffect="non-scaling-stroke" />
        );
      }))}
    </svg>
  );
}

function DetectionDiagram() {
  return (
    <figure className="home-diagram">
      <figcaption className="sr-only">
        How SafeOS reads the camera and microphone, what it keeps and what a server adds
      </figcaption>
      <ol className="home-diagram__stages" role="list">
        <li>
          <p className="home-diagram__label" data-band="browser">In your browser, on the device that watches</p>
          <DiagramBand nodes={inputs} />
          <DiagramWires from={inputs} to={checks} />
        </li>
        <li>
          <DiagramBand nodes={checks} from={inputs} />
          <DiagramWires from={checks} to={outputs} />
        </li>
        <li><DiagramBand nodes={outputs} from={checks} /></li>
        <li className="home-diagram__server">
          <p className="home-diagram__label" data-band="server">Only with a server you run</p>
          <DiagramBand nodes={server} />
        </li>
      </ol>
    </figure>
  );
}

export function HomeDetection() {
  return (
    <section id="how-it-works" className="home-part home-detection" aria-labelledby="detection-title">
      <div className="home-wrap">
        <h2 id="detection-title" className="home-h2">Deep learning, in your browser.</h2>
        <p className="home-p home-detection__lead">
          Motion and sound alerts compare camera frames and measure the sound level in your browser, with no model.
          The People and Wildlife pages add an object-detection model that runs in your browser too.
          Open a card to see how each part works.
        </p>
        <DetectionDiagram />
        <DetectionCards />
        <div className="home-detection__code">
          <a className="link-row" href="https://github.com/framerslab/safeos/tree/master/apps/guardian-ui/src/lib">
            Read the detection code on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
