# Local data and settings

SafeOS keeps saved frames, reference photos, account records and custom sounds in
IndexedDB. Preferences use localStorage. Neither storage is an account vault:
other scripts running on the same site can read browser storage.

## Clearing and signing out

**Settings → Privacy → Clear All Local Data** clears the records in both SafeOS
databases, including microphone recordings and uploaded sounds. It resets local
monitoring state and preferences and removes the SafeOS service-worker caches.
The page reloads only after clearing succeeds. A failed operation displays an
error and can be retried.

**Log Out** and **Clear Session** perform the same cleanup before completing
sign-out. Saved frames, history, subjects, sounds and settings do not carry over
to the next person using that browser. Export anything you want to keep first.
This removes local copies; it does not delete records held by a connected server.

## Saved preferences

Save Changes on the main Settings page updates the settings store used by
monitoring and sound playback. Motion sensitivity, audio sensitivity and alert
volume use the same values as the monitor controls. A volume of zero stays zero.
Emergency alarms retain their explicit full-volume behavior. Quiet hours are
saved to the shared schedule settings. Account preferences remain compatible
with the server profile.

Email and SMS provider secrets entered in Notification Settings stay in page
memory. They are omitted from browser storage, and older saved secrets are
removed when that page opens. Leaving or reloading the page discards the typed
secrets. **Clear provider secrets** clears them immediately. Test messages send
the entered credentials to the configured SafeOS server. For unattended server
notifications, configure providers on that server.

## Optional server and model status

A server address saved in Backend Settings takes effect on static hosts as well
as self-hosted builds. With no saved address, static builds remain local-only.
Clearing the address returns to the build's default. A saved WebSocket address
is used when a server is configured.

Backend Settings, AI Models and the dashboard ask the SafeOS server for its
model status. The browser does not connect directly to Ollama. Configure Ollama
on the SafeOS server; private container addresses need not be reachable from a
phone. A failed server status check is reported as unavailable.

## Controls and notifications

Navigation displays a GitHub link without fetching a star count. Opening that
link contacts GitHub. Model downloads remain separate network requests.

Browser notifications use an existing service-worker registration when available,
including on phones that reject the page Notification constructor. Desktop
installations without a worker use a guarded constructor fallback. Delivery
failure does not interrupt in-app alerts. This does not enable background push
subscriptions or guarantee delivery when the app is closed.

The nap camera test stays active through ordinary renders and is stopped when
the page unmounts. Global keyboard shortcuts defer to focused buttons and other
interactive controls, preserving native Space activation.

Admin review controls send the server's accepted review statuses and display an
error when the server rejects an action.

## Regression coverage

The UI Jest suite renders the affected pages and components with Testing Library.
Browser storage, media, notifications and network edges are faked. CI runs those
regressions alongside the existing suites, type checks, lint and builds.
