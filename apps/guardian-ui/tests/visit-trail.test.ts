/** @jest-environment node */
/**
 * The addresses this tab's document has shown
 *
 * Setup's Back on its first step returns to the page before setup when this
 * document showed one, and otherwise opens the home page. Each case loads the
 * module afresh, so it starts with nothing noted.
 */

type Trail = typeof import('@/lib/visit-trail');

function freshTrail(): Trail {
  let trail: Trail | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    trail = require('@/lib/visit-trail') as Trail;
  });
  return trail as Trail;
}

describe('the pages this document has shown', () => {
  it('gives the page shown before setup', () => {
    const { notePath, pathBefore } = freshTrail();
    notePath('/');
    notePath('/setup/');
    expect(pathBefore('/setup')).toBe('/');
  });

  it('gives nothing when the document opened on setup', () => {
    const { notePath, pathBefore } = freshTrail();
    notePath('/setup/?again=1');
    expect(pathBefore('/setup')).toBeNull();
  });

  it("passes over setup's own addresses", () => {
    const { notePath, pathBefore } = freshTrail();
    notePath('/dashboard/');
    notePath('/setup/');
    notePath('/setup/?next=monitor');
    expect(pathBefore('/setup')).toBe('/dashboard');
  });

  it('follows a person who left setup and came back', () => {
    const { notePath, pathBefore } = freshTrail();
    notePath('/setup/');
    notePath('/');
    notePath('/setup/');
    expect(pathBefore('/setup')).toBe('/');
  });

  it('notes a path once while it stays the same', () => {
    const { notePath, pathBefore } = freshTrail();
    notePath('/history/');
    notePath('/history/');
    notePath('/setup/');
    expect(pathBefore('/setup')).toBe('/history');
  });
});
