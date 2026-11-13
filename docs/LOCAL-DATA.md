# Local data and settings

SafeOS keeps saved frames, reference photos, account records and custom sounds in
IndexedDB. Preferences use localStorage. Neither storage is an account vault:
other scripts running on the same site can read browser storage.

## Clearing and signing out

**Settings → Privacy → Clear All Local Data** clears the records in both SafeOS
databases, including microphone recordings and uploaded sounds. It resets local
monitoring state, schedules and appearance preferences and removes the SafeOS
service-worker caches. Pending thumbnail work is invalidated before records are
deleted, so it cannot restore an earlier match after clearing.
The page reloads only after clearing succeeds. A failed operation displays an
error and can be retried.

**Log Out** and **Clear Session** clear personal data before completing
sign-out. They retain the device's server connection so the next account can
sign in to the same server. Clear All Local Data also removes that connection. Saved frames, history, subjects, sounds and settings do not carry over
to the next person using that browser. Both actions also remove the dashboard
onboarding completion record so the next person sees its introduction and safety
disclaimer. Export anything you want to keep first.
This removes local copies; it does not delete records held by a connected server.

## Saved preferences

Save Changes on the main Settings page updates the settings store used by
monitoring and sound playback. Motion sensitivity, audio sensitivity and alert
volume use the same values as the monitor controls. A volume of zero stays zero.
Emergency alarms retain their explicit full-volume behavior. Quiet hours are
saved to the shared schedule settings from both Settings and Notification
Settings. Earlier saved preferences are imported once per account, or once for
the browser without an account. Values explicitly saved on this browser take
precedence, including zero values. Account sensitivity and volume are imported
only when they differ from a new session's defaults; account quiet hours are
imported only when both times are set. Creating a session therefore preserves
the sensitivity, volume and quiet hours already in effect. Later edits use the
shared store. Account preferences remain compatible with the server profile.

Where the profile lives decides a profile save. For a session on a server,
the change is sent to the server and its answer decides: when the server takes
it, this browser's copy is written too, and a failed copy does not fail the
save. For a session that lives only in this browser, this browser's write
decides. A change that was not taken is put back in the page. Settings then
shows "Failed to save settings." Notification Settings shows "The server did
not take the change. Save again when you are connected." when the server did
not take it, and "Notification settings were not saved. Try again." when this
browser could not write it. Nothing sends a failed change later. The display
name in the account menu and the settings panel's controls say so where the
change was made. A page that reloads without an answer from the server takes
its profile from this browser's copy.

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
phone. A failed server status check is reported as unavailable. The dashboard
shows installed models without claiming they are loaded in memory. A connected
server with no installed models is shown as an empty list, not an offline server.

## Controls and notifications

Navigation displays a GitHub link without fetching a star count. Opening that
link contacts GitHub. Model downloads remain separate network requests.

Browser notifications use an existing service-worker registration when available,
including on phones that reject the page Notification constructor. Desktop
installations without a worker use a guarded constructor fallback. Delivery
failure does not interrupt in-app alerts. Opening a local notification focuses an
existing tab without navigating away from a camera page. This does not enable background push
subscriptions or guarantee delivery when the app is closed.

The nap camera test stays active through ordinary renders and is stopped when
the page unmounts. Global keyboard shortcuts defer to focused buttons and other
interactive controls for activation and widget navigation keys, preserving native
Space activation. Unrelated shortcuts, including Help, remain available.

Admin review controls map the server's flag fields, send its accepted review
statuses and display an error when the server rejects an action. Admin measurements
that the server does not supply are shown as unavailable.

## Regression coverage

The UI Jest suite renders the affected pages and components with Testing Library.
Browser storage, media, notifications and network edges are faked. CI runs those
regressions alongside the existing suites, type checks, lint and builds.
