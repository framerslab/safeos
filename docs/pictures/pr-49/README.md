# Pictures for pull request 49

## alert/

Saved by `apps/guardian-ui/scripts/alert-picture-captures.mjs` in the Pictures
workflow's job "Capture the home page pictures" (Chromium, at 390 by 844 and
1440 by 900 pixels, a device scale factor of 2, light and dark) and copied byte
for byte from the `alert-pictures` artifact of
[Pictures run 45079552958](https://github.com/framerslab/safeos/actions/runs/45079552958),
which built commit c29fe22. Each file is `alert-<state>-<width>-<look>.png`,
clipped to the state's own part of the page:

- `card`: three Motion alerts on the watch; the newest card shows the camera's
  picture with its box and the close-up beside "Close-up", the two older cards a
  thumbnail.
- `sound-card`: a Sound alert's card: the picture with no box and "What the
  camera saw when the sound came."
- `card-failed`: three Motion alerts; the script makes the browser refuse the
  second one's picture as it is saved. On its thumbnail card the problem glyph and "This
  picture could not be saved on this device. It shows here until you reload."
  stay after the newer alert moved it down.
- `opened`: the newest Motion alert's picture after **Open picture**, saved
  whole: the picture, the close-up, **Show the box**, **Save picture** and
  **Delete picture**. On a phone the window is made as tall as the dialog's
  content for the picture.
- `history`: History's rows of the same watch's alerts, each with its
  thumbnail, its kind and level, the date and time, and **Open picture**.
- `watch-group`: the group **Alert pictures** in the watch's settings, its
  heading row included.
- `settings-group`: the same group on Settings > Detection.
- `notice`: the notice "Each alert keeps a picture", which opens before a
  device's first watch.
- `setup-choice`: the same choice in setup's camera step, on a first visit
  that has not finished setup.
- `notification-setting`: **Show the picture in alert notifications** on
  Settings > Notifications, in a browser that allows notifications.
- `live-box`: the live picture with the box and "Motion here at {time}", in the
  10 seconds after an alert.
- `sighting`: a Lost and Found sighting of the pet "Stripes": the camera's
  picture with its box, the close-up and the pet's saved photo side by side,
  each with its label, "Could this be Stripes?", the time and the two lines.
- `dashboard-sighting`: the dashboard's Since you last looked after that
  sighting, in the same visit: the sighting listed as Lost and Found's,
  "Colours like Stripes’s", with its kept close-up.

The camera is Chromium's fake camera playing the committed sample clip
(`apps/guardian-ui/public/home/sample-clip.mp4`, converted to `.y4m` and `.wav`
in the job). The clip's camera moves, so an alert from the whole clip boxes the
whole frame and has no close-up. For `card`, `opened`, `history` and
`live-box` the page's camera is that clip held still outside its middle part,
where it plays on, so the middle part is what changes. The sound card plays the
clip as it is. The sighting's camera plays a striped clip the script writes,
and Stripes is enrolled from a striped photo on the Lost & Found page.

## before/

Master at c59795d, the base of this pull request, for the pages this pull
request changes:

- `monitor-<width>-<look>.png`, `history-<width>-<look>.png`,
  `settings-notifications-<width>-<look>.png`,
  `dashboard-setup-<width>-<look>.png` (the dashboard once setup is done) and
  `setup-camera-refused-<width>-<look>.png` (setup's camera step after a
  refused camera request), copied byte for byte from the `pictures-before`
  artifact of the same
  [Pictures run 45009536251](https://github.com/framerslab/safeos/actions/runs/45009536251).
- `settings-detection-<width>-<look>.png`, copied byte for byte from the
  `pictures` artifact of
  [Pictures run 45012090084](https://github.com/framerslab/safeos/actions/runs/45012090084),
  started by hand on master at c59795d with the route `/settings/detection/`.

Each is the page at 390 by 844 and 1280 by 800 pixels, light and dark, from
`apps/guardian-ui/scripts/capture-pictures.mjs`. Master's alert card before
this change is the committed home capture,
`apps/guardian-ui/public/home/capture-landscape-<look>.png`.
