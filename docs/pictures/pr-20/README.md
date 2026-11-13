# Failed profile save pictures

Captured in CI for pull request #20 at 390 and 1280 pixels, in the light and dark looks, in the
[Pictures run](https://github.com/framerslab/safeos/actions/runs/43487393962):

- Before: base commit `79320ff5a785bf90596f1e048fd1d274f68a627d`.
- After: capture commit `731cd508417f5373ba47688b624c45b0ed39df99`.

Both versions use the capture script of the after commit. Each scenario opens the dashboard
with a saved server address, which starts a session against a fixture server, then opens
Settings, and Notification Settings where named, inside the app and presses Save.

- `notifications-server-refused-*`: a session on the server; the server answers the profile
  change with `500`. Before shows "Notification settings saved.", since that version did not read
  the answer. After shows "The server did not take the change. Save again when you are connected."
- `notifications-not-saved-*`: the server does not make a session, so the tab makes a session
  that lives only in this browser, and this browser cannot write its profile copy. Before shows
  "Notification settings saved." After shows "Notification settings were not saved. Try again."
- `settings-failed-*`: a session on the server; the server answers the profile change with `500`.
  Before shows "Settings saved!" After shows "Failed to save settings."

The pictures are full pages. The site's fixed top and bottom bars are left out: the Settings
message sits at the top right, under the top bar, in both versions.
