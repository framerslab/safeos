/** @jest-environment jsdom */
/**
 * The page before setup in this tab's history
 *
 * Setup's Back on its first step returns to the page before setup when this
 * document opened setup's entry from one of its own pages, and otherwise
 * opens the home page. Each case loads the module afresh, so it starts as a
 * document that has shown nothing, and each address after the first is a new
 * entry of the browser's history, as a press on a link makes it.
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

/** The document opens on `address`, in place of whatever the tab showed. */
function openOn(address: string) {
  window.history.replaceState(null, '', address);
}

/** A press on a link to `address`: a new entry. */
function follow(address: string) {
  window.history.pushState(null, '', address);
}

/** The browser's back button, once its entry is shown. */
function browserBack(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
    window.history.back();
  });
}

describe('the page before setup', () => {
  it('gives the page shown before setup', () => {
    const { notePath, pathBefore } = freshTrail();
    openOn('/');
    notePath('/');
    follow('/setup/');
    notePath('/setup/');
    expect(pathBefore('/setup')).toBe('/');
  });

  it('gives nothing when the document opened on setup', () => {
    const { notePath, pathBefore } = freshTrail();
    openOn('/setup/?again=1');
    notePath('/setup/?again=1');
    expect(pathBefore('/setup')).toBeNull();
  });

  it("passes over setup's own addresses", () => {
    const { notePath, pathBefore } = freshTrail();
    openOn('/dashboard/');
    notePath('/dashboard/');
    follow('/setup/');
    notePath('/setup/');
    notePath('/setup/?next=monitor');
    expect(pathBefore('/setup')).toBe('/dashboard');
  });

  it('follows a person who left setup and came back by a link', () => {
    const { notePath, pathBefore } = freshTrail();
    openOn('/setup/');
    notePath('/setup/');
    follow('/');
    notePath('/');
    follow('/setup/');
    notePath('/setup/');
    expect(pathBefore('/setup')).toBe('/');
  });

  it("gives nothing when the browser's back button returns to setup's first entry, whose page before is another site's", async () => {
    // The input: another site opened setup, a press on the header opened the dashboard, and the browser's back button returned to setup.
    const { notePath, pathBefore } = freshTrail();
    openOn('/setup/');
    notePath('/setup/');
    follow('/dashboard/');
    notePath('/dashboard/');
    await browserBack();
    notePath('/setup/');
    expect(pathBefore('/setup')).toBeNull();
  });

  it("keeps the page before setup when the browser's back button returns to setup", async () => {
    const { notePath, pathBefore } = freshTrail();
    openOn('/history/');
    notePath('/history/');
    follow('/setup/');
    notePath('/setup/');
    follow('/dashboard/');
    notePath('/dashboard/');
    await browserBack();
    notePath('/setup/');
    expect(pathBefore('/setup')).toBe('/history');
  });

  it('gives nothing for an entry an earlier document of the tab opened', () => {
    const first = freshTrail();
    openOn('/');
    first.notePath('/');
    follow('/setup/');
    first.notePath('/setup/');
    // A reload: a new document on the same entry.
    const second = freshTrail();
    second.notePath('/setup/');
    expect(second.pathBefore('/setup')).toBeNull();
  });
});
