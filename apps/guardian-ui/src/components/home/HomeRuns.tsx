'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { HOME_RUN_WIDE, mediaPath, type HomeRun, type RunLook, type RunSize } from '@/lib/home-runs';
import styles from './HomeRuns.module.css';

type Intent = 'auto' | 'loop' | 'pause' | 'stop';
type Connection = EventTarget & { effectiveType?: string; saveData?: boolean };
type Environment = { size: RunSize; look: RunLook; reduced: boolean; limited: boolean; online: boolean; visible: boolean };

const looks = ['dark', 'light'] as const;
const sizes = ['square', 'wide'] as const;
const offlineMessage = 'The recordings need a connection. Each picture shows its moment.';
const slowMessage = 'Press Play to load this recording.';
const failedMessage = 'This recording did not load. Its picture shows the moment it records.';

function useRunEnvironment() {
  const [environment, setEnvironment] = useState<Environment>();
  useEffect(() => {
    const wide = matchMedia(HOME_RUN_WIDE);
    const systemLook = matchMedia('(prefers-color-scheme: dark)');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.documentElement;
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    function read() {
      setEnvironment({
        size: wide.matches ? 'wide' : 'square',
        look: root.classList.contains('light') ? 'light' : root.classList.contains('dark') || systemLook.matches ? 'dark' : 'light',
        reduced: reduce.matches || root.classList.contains('reduce-motion'),
        limited: Boolean(connection?.saveData || /^(?:slow-)?2g$/.test(connection?.effectiveType ?? '')),
        online: navigator.onLine,
        visible: !document.hidden,
      });
    }
    const look = new MutationObserver(read);
    look.observe(root, { attributes: true, attributeFilter: ['class'] });
    for (const query of [wide, systemLook, reduce]) query.addEventListener('change', read);
    connection?.addEventListener('change', read);
    document.addEventListener('visibilitychange', read);
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    read();
    return () => {
      look.disconnect();
      for (const query of [wide, systemLook, reduce]) query.removeEventListener('change', read);
      connection?.removeEventListener('change', read);
      document.removeEventListener('visibilitychange', read);
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
    };
  }, []);
  return environment;
}

function Trouble() {
  return (
    <div className="home-run__problem" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
        <path d="M12 3 22 20H2L12 3Zm0 7v4.5m0 2.7v.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 200 12" preserveAspectRatio="none" className="home-run__broken" focusable="false">
        <path d="M0 6H84m32 0h84" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function Arrow({ backward = false }: { backward?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={backward ? 'home-run__arrow--back' : undefined}>
      <path d="M4 12h16m-7-7 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const attribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function posterTemplate(entry: HomeRun) {
  // The parser gives a template's contents their own document fragment.
  // Keep it inert and opaque to hydration while the player uses the record.
  const sources = sizes.flatMap((size) => looks.flatMap((look) => {
    const files = entry.variants[size][look].poster;
    const media = (size === 'wide' ? HOME_RUN_WIDE : '(width < 1280px)') + ' and (prefers-color-scheme: ' + look + ')';
    return Object.values(files).reverse().map((file) =>
      '<source srcset="' + attribute(mediaPath(file)) + '" media="' + attribute(media)
      + '" type="image/' + file.format + '" width="' + file.width + '" height="' + file.height + '">');
  }));
  const fallback = entry.variants.square.dark.poster.webp;
  return '<picture>' + sources.join('') + '<img src="' + attribute(mediaPath(fallback)) + '" alt="'
    + attribute(entry.description) + '" width="' + fallback.width + '" height="' + fallback.height + '"></picture>';
}

export function HomeRuns({ runs }: { runs: HomeRun[] }) {
  const [index, setIndex] = useState(0);
  const [inView, setInView] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [intent, setIntent] = useState<Intent>('auto');
  const [explicit, setExplicit] = useState(false);
  const [attached, setAttached] = useState<string>();
  const [frame, setFrame] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string>();
  const [posterError, setPosterError] = useState<string>();
  const [posterReady, setPosterReady] = useState<string>();
  const [playTriedOffline, setPlayTriedOffline] = useState(false);
  const [message, setMessage] = useState('');
  const [edges, setEdges] = useState({ start: false, end: false });
  const environment = useRunEnvironment();
  const region = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const movie = useRef<HTMLVideoElement>(null);
  const passes = useRef(0);
  const failures = useRef(0);
  const resume = useRef<'auto' | 'loop'>('auto');
  const scrolling = useRef<number>(0);
  const initialWebp = useRef(true);
  const loadedPoster = useRef<{ id: string; size: RunSize; look: RunLook; avif: boolean }>();
  const run = runs[index];
  const defaultPoster = Object.fromEntries(sizes.flatMap((size) => looks.map((look) => [
    '--run-' + size + '-' + look, 'url("' + mediaPath(runs[0].variants[size][look].poster.webp) + '")',
  ]))) as CSSProperties;
  const variant = environment && run.variants[environment.size][environment.look];
  const retainedPoster = !environment?.online && loadedPoster.current?.id === run.id
    && loadedPoster.current?.look === environment?.look ? loadedPoster.current : undefined;
  const posterSize = retainedPoster?.size ?? (environment?.online ? environment.size : 'square');
  const poster = environment && run.variants[posterSize][environment.look].poster;
  const videoUrl = variant && mediaPath(variant.video);
  const webp = poster && mediaPath(poster.webp);
  const avif = poster?.avif && (retainedPoster?.avif || (environment?.online && !initialWebp.current))
    ? mediaPath(poster.avif) : undefined;
  const posterKey = avif ?? webp;
  const shownMovie = videoUrl && attached === videoUrl;
  const failed = Boolean(videoUrl && error === videoUrl);
  const showFrame = Boolean(shownMovie && frame === videoUrl && !failed);
  const posterFailed = Boolean(posterKey && posterError === posterKey);
  const allowed = Boolean(environment?.online && environment.visible && inView && (intent === 'loop'
    || (intent === 'auto' && (explicit || (!environment.reduced && !environment.limited && !hover && !focus)))));
  const starting = allowed && !failed && !showFrame;
  const toggleActive = playing || starting || Boolean(shownMovie && !failed && (intent === 'auto' || intent === 'loop'));
  const messageId = 'home-run-description-' + run.id;

  useEffect(() => {
    if (!hover && !focus) setExplicit(false);
  }, [hover, focus]);

  useEffect(() => {
    const box = region.current;
    if (!box) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const list = strip.current;
    if (!list) return;
    const read = () => setEdges({ start: list.scrollLeft > 1, end: list.scrollLeft + list.clientWidth < list.scrollWidth - 1 });
    const resize = new ResizeObserver(read);
    resize.observe(list);
    list.addEventListener('scroll', read, { passive: true });
    read();
    return () => {
      resize.disconnect();
      list.removeEventListener('scroll', read);
      cancelAnimationFrame(scrolling.current);
    };
  }, []);

  useEffect(() => {
    const element = movie.current;
    setAttached(undefined);
    setFrame(undefined);
    setPlaying(false);
    setError(undefined);
    return () => {
      if (element?.hasAttribute('src')) {
        element.removeAttribute('src');
        element.load();
      }
    };
  }, [videoUrl]);

  useEffect(() => {
    if (allowed && videoUrl && !failed && (posterReady === posterKey || posterFailed)) setAttached(videoUrl);
  }, [allowed, videoUrl, posterKey, posterReady, posterFailed, failed]);

  useEffect(() => {
    const element = movie.current;
    if (!element || !shownMovie) return;
    if (!allowed || failed) {
      element.pause();
      return;
    }
    let current = true;
    void element.play().catch(() => {
      if (current) {
        if (element.error) setError(videoUrl);
        else {
          setIntent('pause');
          setExplicit(false);
        }
      }
    });
    return () => { current = false; };
  }, [allowed, failed, shownMovie, videoUrl]);

  function advance() {
    reveal(index === runs.length - 1 ? 0 : index + 1);
    if (index === runs.length - 1) {
      passes.current += 1;
      setIndex(0);
      if (passes.current >= 2) {
        setAttached(undefined);
        setFrame(undefined);
        setExplicit(false);
        setIntent('stop');
      }
    } else {
      setIndex(index + 1);
    }
    setPlaying(false);
    initialWebp.current = false;
  }

  useEffect(() => {
    if (!failed || intent !== 'auto') return;
    const timer = window.setTimeout(() => {
      failures.current += 1;
      if (failures.current < runs.length) advance();
      else {
        setAttached(undefined);
        setIntent('stop');
      }
    }, 800);
    return () => window.clearTimeout(timer);
    // The timer is tied to this run and playback intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed, intent, index]);

  function reveal(step: number, instant = false) {
    const list = strip.current;
    const key = list?.querySelectorAll('button')[step];
    if (!list || !key) return;
    const bounds = list.getBoundingClientRect();
    const target = key.getBoundingClientRect();
    const padding = 8;
    const from = list.scrollLeft;
    const delta = target.right > bounds.right - padding ? target.right - bounds.right + padding
      : Math.min(0, target.left - bounds.left - padding);
    if (!delta) return;
    cancelAnimationFrame(scrolling.current);
    if (instant || environment?.reduced) {
      list.scrollLeft = from + delta;
      return;
    }
    const start = performance.now();
    const draw = (now: number) => {
      const progressed = Math.min(1, (now - start) / 180);
      list.scrollLeft = from + delta * (1 - (1 - progressed) ** 2);
      if (progressed < 1) scrolling.current = requestAnimationFrame(draw);
    };
    scrolling.current = requestAnimationFrame(draw);
  }

  function choose(step: number) {
    if (step < 0 || step >= runs.length) return;
    if (step !== index) initialWebp.current = false;
    passes.current = 0;
    failures.current = 0;
    resume.current = 'loop';
    setIndex(step);
    if (step !== index) {
      setAttached(undefined);
      setFrame(undefined);
      setPlaying(false);
    }
    setError(undefined);
    setPlayTriedOffline(false);
    setIntent(environment?.online && !environment.limited && !environment.reduced ? 'loop' : 'pause');
    setExplicit(true);
    setMessage('Showing ' + runs[step].key + ', ' + (step + 1) + ' of ' + runs.length);
    reveal(step);
  }

  function toggle() {
    if (!environment?.online) {
      setPlayTriedOffline(true);
      return;
    }
    if (toggleActive) {
      resume.current = intent === 'loop' ? 'loop' : 'auto';
      setIntent('pause');
      setExplicit(false);
      return;
    }
    if (intent === 'stop') {
      passes.current = 0;
      failures.current = 0;
    }
    setError(undefined);
    setPlayTriedOffline(false);
    setIntent(environment.limited || environment.reduced ? 'loop' : resume.current);
    setExplicit(true);
  }

  const status = playTriedOffline && environment?.online === false ? offlineMessage
    : failed ? failedMessage : environment?.limited && intent !== 'loop' ? slowMessage : '';
  return (
    <section
      className="home-runs"
      ref={region}
      aria-label="Recorded runs of SafeOS Guardian"
      data-paused={intent === 'pause' || intent === 'stop' || environment?.visible === false || undefined}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHover(true); }}
      onPointerLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
      }}
    >
      <div className="home-run__frame" style={defaultPoster} data-enhanced={Boolean(environment)}
        data-offline={environment?.online === false || undefined} data-loading={starting || undefined}>
        {!environment && <div role="img" aria-label={run.description} className="home-run__first-poster" />}
        {poster && (
          <picture className="home-run__poster" key={posterKey} hidden={showFrame || posterFailed}>
            {avif && <source type="image/avif" srcSet={avif} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={webp} width={poster.webp.width} height={poster.webp.height} alt={run.description}
              onLoad={(event) => {
                if (environment) loadedPoster.current = {
                  id: run.id, size: posterSize, look: environment.look, avif: event.currentTarget.currentSrc.endsWith('.avif'),
                };
                setPosterReady(posterKey);
              }} onError={() => setPosterError(posterKey)} />
          </picture>
        )}
        <video key={videoUrl ?? 'initial'} ref={movie} muted playsInline preload="none"
          aria-label={run.description} aria-describedby={messageId} hidden={!showFrame}
          src={shownMovie ? videoUrl : undefined} loop={intent === 'loop'}
          onPlaying={() => {
            setFrame(videoUrl);
            setPlaying(true);
            failures.current = 0;
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => { if (intent === 'auto') advance(); }}
          onError={() => { if (shownMovie) { setPlaying(false); setError(videoUrl); } }}
        />
        {posterFailed && !showFrame && <Trouble />}
        <span className="corner-ticks" aria-hidden="true"><i /><i /><i /><i /></span>
      </div>
      <div className="home-run__controls">
        <button type="button" className="home-run__control home-run__toggle" disabled={!environment}
          onClick={toggle} aria-label={toggleActive ? 'Pause the recordings' : 'Play the recordings'}>
          {toggleActive ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="home-run__control" aria-label="Previous run"
          disabled={!environment || index === 0} onClick={() => choose(index - 1)}><Arrow backward /></button>
        <div className="home-run__strip-wrap" data-more-before={edges.start || undefined} data-more-after={edges.end || undefined}>
          <div className="home-run__strip" ref={strip}>
            {runs.map(({ id, key }, step) => (
              <button key={id} type="button" data-run={id} disabled={!environment}
                aria-current={step === index ? 'step' : undefined} aria-describedby={'home-run-description-' + id}
                onFocus={() => reveal(step, true)} onClick={() => choose(step)}>
                {key}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="home-run__control" aria-label="Next run"
          disabled={!environment || index === runs.length - 1} onClick={() => choose(index + 1)}><Arrow /></button>
      </div>
      <p className={`home-run__caption ${styles.caption}`} data-run-caption>{run.description}</p>
      <div className="home-run__status" role="status">
        {status && <>{failed && <Trouble />}<span>{status}</span></>}
      </div>
      <p className="sr-only" aria-live="polite">{message}</p>
      <noscript>
        <ul>
          {runs.slice(1).map((entry) => <li key={entry.id}>{entry.key}. {entry.description}</li>)}
        </ul>
      </noscript>
      {runs.map((entry) => (
        <div key={entry.id}>
          <ol id={'home-run-description-' + entry.id} hidden>
            {entry.longDescription.map((sentence) => <li key={sentence}>{sentence}</li>)}
          </ol>
          <template data-run-poster={entry.id} dangerouslySetInnerHTML={{ __html: posterTemplate(entry) }} />
        </div>
      ))}
    </section>
  );
}
