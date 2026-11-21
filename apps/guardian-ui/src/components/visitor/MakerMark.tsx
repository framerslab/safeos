/**
 * A maker's mark
 *
 * The mark of Frame, AgentOS or Paracosm as its own site serves it: a file of
 * public/logos, copied byte for byte and never drawn in code. Frame and
 * Paracosm publish one form for a dark ground and one for a light ground, and
 * the stylesheet shows the one made for the look that is on; AgentOS
 * publishes one file for both. The name stands beside the mark in text, so
 * the mark has an empty text equivalent. Its place is held at its size, so
 * nothing moves when the file arrives or does not.
 *
 * @module components/visitor/MakerMark
 */

export type Maker = 'frame' | 'agentos' | 'paracosm';

/** Each maker's files: the one for the dark look, and the one for the light look where it has its own. */
export const MAKER_MARKS: Record<Maker, { dark: string; light?: string }> = {
  frame: { dark: '/logos/frame-icon-dark.svg', light: '/logos/frame-icon-light.svg' },
  agentos: { dark: '/logos/agentos-icon.svg' },
  paracosm: { dark: '/logos/paracosm-icon-color.svg', light: '/logos/paracosm-icon-color-light.svg' },
};

interface MakerMarkProps {
  maker: Maker;
  /** The mark's width and height in px: 24 in the footer, 40 on About. */
  size: number;
  className?: string;
}

export function MakerMark({ maker, size, className = '' }: MakerMarkProps) {
  const { dark, light } = MAKER_MARKS[maker];
  const image = (src: string, look?: 'dark' | 'light') => (
    // A plain image: the file is the site's own and is shown as it is.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={look ? `maker-mark__image maker-mark__image--${look}` : 'maker-mark__image'}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
  return (
    <span className={`maker-mark ${className}`.trim()} style={{ width: size, height: size }}>
      {light ? (
        <>
          {image(dark, 'dark')}
          {image(light, 'light')}
        </>
      ) : (
        image(dark)
      )}
    </span>
  );
}

export default MakerMark;
