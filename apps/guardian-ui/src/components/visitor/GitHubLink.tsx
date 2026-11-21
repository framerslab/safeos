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

import { githubLinkDescription, githubLinkName, shortCount, starCount, starWord } from '@/lib/github-stars';
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

export default GitHubLink;
