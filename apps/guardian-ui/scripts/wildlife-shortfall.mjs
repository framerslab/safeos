// Why Measure's Wildlife check fails, or null when it passed. `results` is
// what scripts/measure-devices.mjs writes to measurements.json.

/** Wildlife's real watch must get through its motion gate, finish an inference and save a cat on each play. */
export function wildlifeShortfall(results) {
  // The watch runs in the laptop's model measurement, once the model is in; when that stops, it never starts.
  if (!results.wildlife) {
    const laptop = results.runs?.find((run) => run.class === 'laptop' && run.cpuThrottlingRate?.value === 1);
    return `Wildlife’s watch did not run: the laptop’s model measurement stopped first (${laptop?.model?.error ?? 'no result'}).`;
  }
  if (results.wildlife.attempts?.length !== 2
    || results.wildlife.attempts.some((attempt) => attempt.error || attempt.frameReads < 2 || !attempt.inferences.length)) {
    return 'Wildlife did not complete a model check through its motion gate on both plays of the sample clip.';
  }
  if (results.wildlife.attempts.some((attempt) => attempt.catSecond === null)) {
    return 'Wildlife did not save a cat sighting on both watches of the sample clip.';
  }
  return null;
}
