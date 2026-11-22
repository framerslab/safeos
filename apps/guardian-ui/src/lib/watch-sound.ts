/**
 * Which alerts sound
 *
 * The alert sound and its escalation belong to the running watch: only an
 * alert that watch raised sounds or grows louder. An alert left unseen from
 * an earlier watch stays new on the dashboard and silent.
 *
 * @module lib/watch-sound
 */

const raised = new Set<string>();

/** An alert the running watch raised. */
export function watchRaised(id: string): void {
  raised.add(id);
}

export function raisedByThisWatch(id: string): boolean {
  return raised.has(id);
}

/** A watch starts or ends: the alerts of the watch before it sound no more. */
export function forgetRaised(): void {
  raised.clear();
}
