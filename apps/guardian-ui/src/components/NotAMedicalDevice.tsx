/**
 * Not a medical device
 *
 * The sentence every public page that names babies carries. SafeOS alerts on
 * motion and sound and measures nothing about the body (the monitor compares
 * frames and sound levels, src/lib/pixel-detection.ts and
 * src/lib/audio-levels.ts). The link is the NIH Safe to Sleep page.
 *
 * @module components/NotAMedicalDevice
 */

export const SAFE_SLEEP_URL = 'https://safetosleep.nichd.nih.gov/reduce-risk/reduce';

export function NotAMedicalDevice({ className = '' }: { className?: string }) {
  return (
    <p className={className}>
      SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS.{' '}
      <a
        href={SAFE_SLEEP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        Safe-sleep guidance (NIH)
      </a>
    </p>
  );
}

export default NotAMedicalDevice;
