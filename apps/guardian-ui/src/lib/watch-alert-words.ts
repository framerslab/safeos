const names = { motion: 'Motion', audio: 'Sound', pixel: 'Picture change' } as const;
export type WatchAlertKind = keyof typeof names;

const savedNames: ReadonlyArray<[RegExp, WatchAlertKind]> = [
  [/^Motion detected\b/i, 'motion'],
  [/^Audio detected\b/i, 'audio'],
  [/^Pixel movement detected\b/i, 'pixel'],
];

/** Saved alerts from older releases may only have their kind in the message. */
export function watchAlertKind(id: string, message: string): WatchAlertKind | undefined {
  const prefix = id.split('-', 1)[0];
  if (prefix === 'motion' || prefix === 'audio' || prefix === 'pixel') return prefix;
  return savedNames.find(([pattern]) => pattern.test(message))?.[1];
}

const clock = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });
const levelWord = (level: string) => level.charAt(0).toUpperCase() + level.slice(1);

export function watchAlertLine(kind: WatchAlertKind, at: string | undefined): string {
  const time = Date.parse(at ?? '');
  return Number.isFinite(time) ? `${names[kind]} at ${clock.format(time)}` : names[kind];
}

export function watchAlertAnnouncement(kind: WatchAlertKind, level: string, at: string | undefined): string {
  const time = Date.parse(at ?? '');
  const when = Number.isFinite(time) ? `, at ${clock.format(time)}` : '';
  return `New alert: ${names[kind]}, ${levelWord(level)}${when}.`;
}

export function watchAlertNotice(kind: WatchAlertKind, level: string, at: number) {
  return { title: `${names[kind]} alert`, body: `${levelWord(level)}, ${clock.format(at)}.` };
}
