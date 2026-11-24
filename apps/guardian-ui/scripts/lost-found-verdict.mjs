// The Lost and Found probe's verdict on what the watch kept
// (scripts/lost-found-probe.mjs), kept apart so a test can run it.
//
// Only what the watch kept inside its watch counts: a frame or a sighting
// timed after liveAt + watchMs is left out. A saved frame is an alert when the
// watch raised the alert for it (its record's `alerted` mark); a frame saved
// by a build that keeps no mark is read by its score against the alert line.
// A sighting the watch kept is an alert too. The first alert is the earlier of
// the first alerting frame and the first sighting.

const byTime = (a, b) => a.at - b.at;

export function judgeWatch({ saved, sightings, liveAt, watchMs, alertLine }) {
  const inWatch = (entry) => entry.at <= liveAt + watchMs;
  const frames = saved.filter(inWatch).sort(byTime);
  const kept = sightings.filter(inWatch).sort(byTime);
  const alerting = frames.filter((frame) => (typeof frame.alerted === 'boolean' ? frame.alerted : frame.score >= alertLine));
  const firstFrameAlert = alerting[0] ?? null;
  const firstSighting = kept[0] ?? null;
  const firstAlert = firstFrameAlert && (!firstSighting || firstFrameAlert.at <= firstSighting.at)
    ? { kind: 'saved frame', ...firstFrameAlert }
    : firstSighting ? { kind: 'sighting', ...firstSighting } : null;
  return {
    saved: frames,
    sightings: kept,
    overLine: frames.filter((frame) => frame.score >= alertLine).length,
    alerting: alerting.length,
    firstSaved: frames[0] ?? null,
    firstAlert,
    best: frames.length > 0 ? frames.reduce((top, frame) => (frame.score > top.score ? frame : top)) : null,
    alerted: firstAlert !== null,
  };
}

// Why the pet the walk enrolled is not what it added, or null when it is. The
// page shows the pet from memory even when its save failed, so the probe reads
// the saved record (readPet) and holds it to the photos the walk added.
export function savedPetProblem(pet, photoCount) {
  if (!pet) return 'the pet was not saved on the device';
  const held = Array.isArray(pet.referenceImages) ? pet.referenceImages.length : 0;
  return held === photoCount ? null : `the saved pet holds ${held} photos, not ${photoCount}`;
}
