/**
 * The words Lost and Found shows and speaks.
 *
 * The watch compares the colours and coarse shape of what the camera sees
 * with a pet's photos. A sighting is a question and a resemblance the person
 * checks: never a score, a percentage or a word that claims more than that.
 * Every screen that names a sighting takes its words from here.
 */

/** "{name}’s" */
export const possessive = (name: string): string => `${name}’s`;

/** The question a sighting asks: "Could this be {name}?" */
export const sightingQuestion = (name: string): string => `Could this be ${name}?`;

/** The two lines under the question: what was alike, and what to do. */
export const sightingLines = (name: string): [string, string] => [
  `Colours and shape like ${possessive(name)} photos.`,
  'Compare the two pictures. It can be another animal that looks alike.',
];

/** The plate on the camera's picture beside the box. */
export const sightingPlate = (name: string): string => `Colours like ${possessive(name)}`;

const timeWithSeconds = (at: number | Date): string =>
  new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(new Date(at));

/** The notification's body: the first line with the device's own time, seconds included. */
export const sightingNotificationBody = (name: string, at: number | Date): string =>
  `Colours and shape like ${possessive(name)} photos, ${timeWithSeconds(at)}.`;

/** The line the full-screen pictures speak unless the person wrote their own. */
export const SPOKEN_DEFAULT = 'Colours like your pet’s photos are in view.';

/** The line devices saved as the spoken default before it changed. */
export const EARLIER_SPOKEN_DEFAULT = 'Attention! Your lost subject has been detected.';

export type LineState = 'over' | 'under';

/** Where a reading sits against the alert line: over at the line or above it. */
export const lineState = (score: number, alertLine: number): LineState =>
  score >= alertLine ? 'over' : 'under';

export const LINE_WORDS: Record<LineState, string> = {
  over: 'Over the line',
  under: 'Quiet',
};

/** "No possible sightings saved", "1 possible sighting saved", "{n} possible sightings saved" */
export const savedSightings = (count: number): string => {
  if (count <= 0) return 'No possible sightings saved';
  if (count === 1) return '1 possible sighting saved';
  return `${count} possible sightings saved`;
};

/** "1 check like {name}’s photos", "{n} checks in a row like {name}’s photos" */
export const checksInARow = (count: number, name: string): string =>
  count === 1
    ? `1 check like ${possessive(name)} photos`
    : `${count} checks in a row like ${possessive(name)} photos`;
