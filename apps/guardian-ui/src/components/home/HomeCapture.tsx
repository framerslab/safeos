/**
 * The first screen's capture
 *
 * A picture of the product's own monitor, captured by the Pictures workflow
 * while the monitor watched a recorded clip through the camera path. Each
 * width shows its own crop and each look the capture made in that look; CSS
 * picks both, so the right one shows before any script runs. The box takes
 * the ratio of its crop's own file (its width and height, from the capture's
 * record) and keeps it while the file loads; when the file does not load it
 * shows the picture's text equivalent.
 *
 * @module components/home/HomeCapture
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export interface CaptureCrop {
  /** The crop's name in its file: capture-<name>-<look>.webp and .png. */
  name: 'phone' | 'portrait' | 'landscape';
  /** The file's width and height in pixels. */
  width: number;
  height: number;
  /** What the picture shows, in words. */
  alt: string;
}

const LOOKS = ['dark', 'light'] as const;

// React's own name for this attribute differs between versions; the HTML name works in all.
const HIGH_PRIORITY = { fetchpriority: 'high' } as Record<string, string>;

function CaptureError({ text }: { text: string }) {
  return (
    <div className="capture__error">
      <div className="capture__error-mark" aria-hidden="true">
        <svg className="problem-glyph" viewBox="0 0 24 24" focusable="false">
          <path d="M12 3 22 20H2L12 3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 10v4.5M12 17.2v.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <svg className="capture__error-line" viewBox="0 0 200 12" preserveAspectRatio="none" focusable="false">
          <path d="M0 6H84M116 6H200" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <p>{text}</p>
    </div>
  );
}

export function HomeCapture({ crops, caption }: { crops: CaptureCrop[]; caption: React.ReactNode }) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const frameRef = useRef<HTMLDivElement>(null);

  // A file that failed before this script arrived fired its error unheard.
  useEffect(() => {
    const found: Record<string, boolean> = {};
    frameRef.current?.querySelectorAll<HTMLImageElement>('img[data-capture]').forEach((image) => {
      if (image.complete && image.naturalWidth === 0 && image.offsetParent !== null && image.dataset.capture) {
        found[image.dataset.capture] = true;
      }
    });
    if (Object.keys(found).length > 0) setFailed((before) => ({ ...before, ...found }));
  }, []);

  return (
    <figure className="home-capture">
      <div className="capture__frame" ref={frameRef}>
        {crops.map((crop) => (
          <div
            key={crop.name}
            className={`capture__slot capture__slot--${crop.name}`}
            style={{ '--capture-box': `${((crop.height / crop.width) * 100).toFixed(3)}%` } as React.CSSProperties}
          >
            {LOOKS.map((look) => {
              const id = `${crop.name}-${look}`;
              return (
                <div key={look} className={`capture__pic capture__pic--${look}`}>
                  {failed[id] ? (
                    <CaptureError text={crop.alt} />
                  ) : (
                    <picture>
                      <source srcSet={`/home/capture-${id}.webp`} type="image/webp" />
                      <img
                        data-capture={id}
                        src={`/home/capture-${id}.png`}
                        alt={crop.alt}
                        width={crop.width}
                        height={crop.height}
                        loading="lazy"
                        decoding="async"
                        {...HIGH_PRIORITY}
                        onError={() => setFailed((before) => ({ ...before, [id]: true }))}
                      />
                    </picture>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <span className="corner-ticks" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      <figcaption className="capture__caption">{caption}</figcaption>
    </figure>
  );
}

export default HomeCapture;
