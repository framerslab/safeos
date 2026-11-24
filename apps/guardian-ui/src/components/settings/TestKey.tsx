'use client';

/**
 * The key that tests a row: "Play", and "Stop" while it plays, named for
 * what it plays ("Play Alert volume").
 *
 * @module components/settings/TestKey
 */

export function TestKey({
  label,
  playing,
  onPlay,
  onStop,
}: {
  label: string;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
}) {
  const word = playing ? 'Stop' : 'Play';
  return (
    <button
      type="button"
      className="key key--outline set-key"
      aria-label={`${word} ${label}`}
      aria-pressed={playing}
      onClick={playing ? onStop : onPlay}
    >
      {word}
    </button>
  );
}

export default TestKey;
