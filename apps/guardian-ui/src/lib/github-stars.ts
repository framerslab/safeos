/**
 * The repository's star count on the public pages
 *
 * The count is read from GitHub once, when the site is built
 * (scripts/read-github-stars.mjs), and handed to the build as two values: the
 * number and the day it was counted. Every page is written with them, so a
 * visitor's browser asks GitHub nothing until the link is pressed. With no
 * value, or with one that is not a whole number above zero beside a real day,
 * there is no count: the link is its word alone.
 *
 * @module lib/github-stars
 */

export interface StarCount {
  /** How many people have starred the repository. */
  count: number;
  /** The day it was counted, as YYYY-MM-DD. */
  day: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The year, month and date of a YYYY-MM-DD day that exists, or null. */
function dayParts(day: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = new Date(Date.UTC(year, month - 1, date));
  if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== date) return null;
  return [year, month, date];
}

/**
 * Reads the two values as the build was handed them. Anything but a whole
 * number above zero with a day that exists is no count.
 */
export function parseStarCount(count: string | undefined, day: string | undefined): StarCount | null {
  if (!count || !day) return null;
  if (!/^[1-9]\d{0,8}$/.test(count)) return null;
  if (!dayParts(day)) return null;
  return { count: Number(count), day };
}

/** The count this build was handed, or null. */
export function starCount(): StarCount | null {
  return parseStarCount(process.env.NEXT_PUBLIC_GITHUB_STARS, process.env.NEXT_PUBLIC_GITHUB_STARS_DATE);
}

/**
 * The count as the header shows it: the number itself under a thousand, then
 * thousands with one decimal ("1.2k"), whole thousands from a hundred
 * thousand ("100k") and millions with one decimal ("1.2M"). Always cut down,
 * never rounded up, so the page shows no star the repository does not have.
 */
export function shortCount(count: number): string {
  const cut = (unit: number, letter: string) => {
    const tenths = Math.floor(count / (unit / 10));
    const decimal = tenths % 10;
    return `${Math.floor(tenths / 10)}${decimal ? `.${decimal}` : ''}${letter}`;
  };
  if (count < 1_000) return String(count);
  if (count < 100_000) return cut(1_000, 'k');
  if (count < 1_000_000) return `${Math.floor(count / 1_000)}k`;
  return cut(1_000_000, 'M');
}

/** "star" for one and "stars" for any other number. */
export function starWord(count: number): string {
  return count === 1 ? 'star' : 'stars';
}

/** The exact count in words, with its thousands separator: "1,234 stars". */
export function exactStars(count: number): string {
  return `${String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${starWord(count)}`;
}

/** A YYYY-MM-DD day as a reader writes it: "18 November 2026". */
export function longDay(day: string): string {
  const parts = dayParts(day);
  if (!parts) return '';
  const [year, month, date] = parts;
  return `${date} ${MONTHS[month - 1]} ${year}`;
}

/** The GitHub link's name: its word, and its count when one was read. */
export function githubLinkName(stars: StarCount | null): string {
  return stars ? `SafeOS on GitHub ${shortCount(stars.count)} ${starWord(stars.count)}` : 'SafeOS on GitHub';
}

/**
 * The GitHub link's description: the day of the count, and the exact number
 * where the link shows the short form.
 */
export function githubLinkDescription(stars: StarCount): string {
  const day = longDay(stars.day);
  return stars.count < 1_000 ? `Counted ${day}.` : `${exactStars(stars.count)}, counted ${day}.`;
}

/** The footer's sentence: the exact count and the day it was counted. */
export function starsSentence(stars: StarCount): string {
  return `${exactStars(stars.count)} on GitHub, counted ${longDay(stars.day)}.`;
}
