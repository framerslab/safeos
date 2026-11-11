/** Async producers retain their generation so clearing can invalidate old work. */
let generation = 0;
export const getLocalDataGeneration = (): number => generation;
export function invalidatePendingLocalData(): void {
  generation += 1;
}
export const isCurrentLocalData = (value: number): boolean => value === generation;
