/**
 * The largest mean RGB change among the parts of the picture, on a 0–100 scale.
 * The 8 × 6 grid gives 40 × 40 pixel cells at the detectors' default size.
 */
export function subjectMotionLevel(current: ImageData, previous: ImageData | null): number {
  const { width, height, data } = current;
  if (!previous || previous.width !== width || previous.height !== height) return 0;

  const before = previous.data;
  const columns = Math.min(8, width);
  const rows = Math.min(6, height);
  let largestMean = 0;

  for (let row = 0; row < rows; row++) {
    const top = Math.floor(row * height / rows);
    const bottom = Math.floor((row + 1) * height / rows);
    for (let column = 0; column < columns; column++) {
      const left = Math.floor(column * width / columns);
      const right = Math.floor((column + 1) * width / columns);
      let change = 0;
      for (let y = top; y < bottom; y++) {
        const start = (y * width + left) * 4;
        const end = start + (right - left) * 4;
        for (let i = start; i < end; i += 4) {
          change += Math.abs(data[i] - before[i])
            + Math.abs(data[i + 1] - before[i + 1])
            + Math.abs(data[i + 2] - before[i + 2]);
        }
      }
      const mean = change / ((bottom - top) * (right - left) * 3);
      largestMean = Math.max(largestMean, mean);
    }
  }

  return largestMean * 100 / 255;
}
