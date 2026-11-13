# Failed profile save pictures

Captured in CI for pull request #20 at 390 and 1280 pixels, in the light and dark looks, in the
[Pictures run](https://github.com/framerslab/safeos/actions/runs/43469523821):

- Before: base commit `79320ff5a785bf90596f1e048fd1d274f68a627d`.
- After: capture commit `48c630625f6dc44bb79a3a9a5e7221a7e7f8b2c1`.

Both versions use the capture script of the after commit. Each scenario opens the dashboard
with a saved server address, which starts a session against a fixture server, then opens
Settings, and Notification Settings where named, inside the app and presses Save.

- `notifications-server-refused-*`: the server answers the profile change with `500`. Before
  shows "Notification settings saved.", since that version did not read the answer. After shows "Saved on this device. The server did not take the change. Save again when you
  are connected."
- `notifications-not-saved-*`: this browser cannot write its profile copy; the server takes the
  change. Before shows "Notification settings saved." After shows "Notification settings were
  not saved. Try again."
- `settings-failed-*`: the server answers the profile change with `500`. Before shows
  "Settings saved!" After shows "Failed to save settings."

The pictures are full pages. The site's fixed top and bottom bars are left out: the Settings
message sits at the top right, under the top bar, in both versions.
