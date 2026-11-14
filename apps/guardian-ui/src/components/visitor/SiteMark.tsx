/**
 * The mark
 *
 * The shield-and-eye mark of public/logo.svg, drawn inline so it takes the
 * colours of the look that is on.
 *
 * @module components/visitor/SiteMark
 */

export function SiteMark({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`site-mark ${className}`.trim()}
      viewBox="0 0 512 512"
      width="32"
      height="32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="site-mark__shield"
        d="M256 32L64 112V240C64 368 144 464 256 496C368 464 448 368 448 240V112L256 32Z"
        strokeWidth="20"
      />
      <path
        className="site-mark__inner"
        d="M256 64L96 132V240C96 348 164 432 256 460C348 432 416 348 416 240V132L256 64Z"
        strokeWidth="4"
      />
      <circle className="site-mark__ring" cx="256" cy="240" r="96" strokeWidth="16" />
      <circle className="site-mark__ring" cx="256" cy="240" r="60" strokeWidth="8" strokeOpacity="0.6" />
      <circle className="site-mark__dot" cx="256" cy="240" r="26" />
      <path className="site-mark__line" d="M256 144V176M256 304V336M160 240H192M320 240H352" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

export default SiteMark;
