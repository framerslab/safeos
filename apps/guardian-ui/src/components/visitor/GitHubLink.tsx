/**
 * The link to SafeOS's code, with the repository's star count
 *
 * The word, a small outlined star and the count are one link to the
 * repository, in the same tab. The count is written into the page when the
 * site is built (lib/github-stars), so nothing is asked of GitHub until the
 * link is pressed. With a count the link is named by its own content, the
 * word and the number a person sees with "SafeOS on" before them and "stars"
 * after, and described by the day of the count. The word GitHub, the star
 * and the number are one piece that never breaks, so where a narrow column
 * wraps the footer's link the count stays beside its word. With no count read
 * the link is its word alone.
 *
 * @module components/visitor/GitHubLink
 */

import { exactStars, githubLinkDescription, githubLinkName, shortCount, starCount, starWord } from '@/lib/github-stars';
import { Num } from './Num';

export const GITHUB_URL = 'https://github.com/framerslab/safeos';

interface GitHubLinkProps {
  className?: string;
  /** Where the link stands. Each place has a description of its own to point at. */
  place: 'row' | 'menu' | 'footer';
  /** Shows "SafeOS on GitHub" in full, as the footer does; otherwise the word GitHub. */
  full?: boolean;
  onClick?: () => void;
}

/** A five-pointed star in outline, in the colour of the words beside it. */
function Star() {
  return (
    <svg className="star-count__star" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M8 1.8 9.7 6.05l4.58.31-3.52 2.94 1.12 4.44L8 11.3l-3.88 2.44 1.12-4.44L1.72 6.36l4.58-.31Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GitHubLink({ className, place, full = false, onClick }: GitHubLinkProps) {
  const stars = starCount();

  if (!stars) {
    return full ? (
      <a href={GITHUB_URL} className={className} onClick={onClick}>
        SafeOS on GitHub
      </a>
    ) : (
      <a href={GITHUB_URL} className={className} aria-label={githubLinkName(null)} onClick={onClick}>
        <span translate="no">GitHub</span>
      </a>
    );
  }

  const described = `github-count-${place}`;
  return (
    <>
      <a href={GITHUB_URL} className={className} aria-describedby={described} onClick={onClick}>
        {full ? <>SafeOS on{' '}</> : <span className="sr-only">SafeOS on{' '}</span>}
        <span className="star-count">
          <span translate="no">GitHub</span>
          {' '}
          <Star />
          <Num>{shortCount(stars.count)}</Num>
        </span>
        <span className="sr-only">
          {' '}
          {starWord(stars.count)}
        </span>
      </a>
      <span id={described} hidden>
        {githubLinkDescription(stars)}
      </span>
    </>
  );
}

export function GitHubIconLink({ className }: { className: string }) {
  const stars = starCount();
  const name = stars ? `SafeOS on GitHub, ${exactStars(stars.count)}` : githubLinkName(null);

  return (
    <a href={GITHUB_URL} className={`key--icon ${className}`} aria-label={name}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
        />
      </svg>
    </a>
  );
}

export default GitHubLink;
