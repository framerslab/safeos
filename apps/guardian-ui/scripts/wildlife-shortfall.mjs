// Why Measure's Wildlife check fails, or null when it passed. `results` is
// what scripts/measure-devices.mjs writes to measurements.json.

/** Wildlife's real watch must get through its motion gate, finish an inference and save a cat on each play. */
export function wildlifeShortfall(results) {
  if (results.wildlife?.attempts.length !== 2
    || results.wildlife.attempts.some((attempt) => attempt.error || attempt.frameReads < 2 || !attempt.inferences.length)) {
    return 'Wildlife did not complete a model check through its motion gate on both plays of the sample clip.';
  }
  if (results.wildlife.attempts.some((attempt) => attempt.catSecond === null)) {
    return 'Wildlife did not save a cat sighting on both watches of the sample clip.';
  }
  return null;
}
