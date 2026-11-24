import type { ReactNode } from 'react';
import { WayGlyph } from '@/components/dashboard/WaysToWatch';
import { IconBell, IconCamera, IconDatabase, IconMail, IconMic, IconServer } from '@/components/icons';
import { Num } from '@/components/visitor/Num';
import { MODEL_SIZE_MB } from '@/lib/detection-model-facts';

interface DiagramNode {
  id: string;
  label: ReactNode;
  glyph: ReactNode;
  sources?: readonly string[];
}

const inputs: DiagramNode[] = [
  { id: 'camera', label: 'Camera', glyph: <IconCamera /> },
  { id: 'microphone', label: 'Microphone', glyph: <IconMic /> },
  { id: 'pet-photos', label: 'Your pet’s photos', glyph: <WayGlyph way="lost-found" /> },
];

const checks: DiagramNode[] = [
  {
    id: 'motion',
    label: <>Motion: frames compared <Num>5</Num> times a second</>,
    glyph: <WayGlyph way="monitor" />,
    sources: ['camera'],
  },
  {
    id: 'picture-change',
    label: <>Picture change: changed pixels counted <Num>5</Num> times a second</>,
    glyph: <IconCamera />,
    sources: ['camera'],
  },
  {
    id: 'sound',
    label: <>Sound level: read <Num>10</Num> times a second</>,
    glyph: <IconMic />,
    sources: ['microphone'],
  },
  {
    id: 'lost-found',
    label: 'Lost and Found: colours and outline compared twice a second',
    glyph: <WayGlyph way="lost-found" />,
    sources: ['camera', 'pet-photos'],
  },
  {
    id: 'people-wildlife',
    label: <>People and Wildlife: COCO-SSD on TensorFlow.js, run on the graphics chip, <Num>{MODEL_SIZE_MB}</Num> MB, saved after you agree</>,
    glyph: <WayGlyph way="wildlife" />,
    sources: ['camera'],
  },
];

const outputs: DiagramNode[] = [
  {
    id: 'alert',
    label: 'The alert: a sound, a notification and a line in History',
    glyph: <IconBell />,
    sources: checks.map(({ id }) => id),
  },
  {
    id: 'storage',
    label: 'Kept in this browser: settings, alerts, saved frames, your pet’s photos and the model',
    glyph: <IconDatabase />,
  },
];

const server: DiagramNode[] = [
  { id: 'server-frames', label: 'Frames from the Motion and sound page', glyph: <IconCamera /> },
  { id: 'server-alerts', label: 'Email, text and Telegram alerts from the server’s own look at the frames', glyph: <IconMail /> },
  { id: 'server-model', label: 'A model on your server, or a hosted one when you give it a key', glyph: <IconServer /> },
];

const labelId = (id: string) => `home-diagram-${id}`;

function DiagramBand({ nodes, from = [] }: { nodes: DiagramNode[]; from?: DiagramNode[] }) {
  return (
    <ul className="home-diagram__band" role="list" style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}>
      {nodes.map(({ id, label, glyph, sources }) => (
        <li key={id} className="home-diagram__node" data-node={id} aria-describedby={sources?.map(labelId).join(' ')}>
          <span className="home-diagram__glyph" aria-hidden="true">{glyph}</span>
          <span id={labelId(id)}>{label}</span>
          {sources && from === inputs && (
            <span className="home-diagram__inputs" aria-hidden="true">
              {sources.map((source) => inputs.find(({ id }) => id === source)?.label).join(' · ')}
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
        <li><DiagramBand nodes={outputs} /></li>
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
      </div>
    </section>
  );
}
