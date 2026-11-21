# Pictures for pull request 49

## alert/

Saved by `apps/guardian-ui/scripts/alert-picture-captures.mjs` in the Pictures
workflow's job "Capture the home page pictures" (Chromium, at 390 by 844 and
1440 by 900 pixels, a device scale factor of 2, light and dark) and copied byte
for byte from the `alert-pictures` artifact of
[Pictures run 44896775713](https://github.com/framerslab/safeos/actions/runs/44896775713),
which built commit ad6388f. Each file is `alert-<state>-<width>-<look>.png`,
clipped to the state's own part of the page:

- `card`: three Motion alerts on the watch; the newest card shows the camera's
  picture with its box and the close-up beside "Close-up", the two older cards a
  thumbnail.
- `sound-card`: a Sound alert's card: the picture with no box and "What the
  camera saw when the sound came."
- `opened`: the newest Motion alert's picture after **Open picture**, with
  **Show the box**, **Save picture** and **Delete picture**.
- `history`: History's rows of the same watch's alerts, each with its
  thumbnail, its kind and level, the date and time, and **Open picture**.
- `watch-group`: the group **Alert pictures** in the watch's settings.
- `settings-group`: the same group on Settings > Detection.
- `notice`: the notice "Each alert keeps a picture", which opens before a
  device's first watch.
- `notification-setting`: **Show the picture in alert notifications** on
  Settings > Notifications, in a browser that allows notifications.
- `live-box`: the live picture with the box and "Motion here at {time}", in the
  10 seconds after an alert.
- `sighting`: a Lost and Found sighting of the pet "Stripes": the camera's
  picture with its box, the close-up beside the pet's saved photo, "Could this
  be Stripes?", the time and the two lines.

The camera is Chromium's fake camera playing the committed sample clip
(`apps/guardian-ui/public/home/sample-clip.mp4`, converted to `.y4m` and `.wav`
in the job). The clip's camera moves, so an alert from the whole clip boxes the
whole frame and has no close-up. For `card`, `opened`, `history` and
`live-box` the page's camera is that clip held still outside its middle part,
where it plays on, so the middle part is what changes. The sound card plays the
clip as it is. The sighting's camera plays a striped clip the script writes,
and Stripes is enrolled from a striped photo on the Lost & Found page.

## before/

Master at c26fc9b, the base of this pull request, for the pages this pull
request changes:

- `monitor-<width>-<look>.png` and `settings-notifications-<width>-<look>.png`,
  copied byte for byte from the `pictures-before` artifact of the same
  [Pictures run 44886045506](https://github.com/framerslab/safeos/actions/runs/44886045506).
- `history-<width>-<look>.png` and `settings-detection-<width>-<look>.png`,
  copied byte for byte from the `pictures` artifact of
  [Pictures run 44882799803](https://github.com/framerslab/safeos/actions/runs/44882799803),
  started by hand on master with the routes `/history/ /settings/detection/`.

Each is the page's first screen at 390 by 844 and 1280 by 800 pixels, light and
dark, from `apps/guardian-ui/scripts/capture-pictures.mjs`. Master's alert card
before this change is the committed home capture,
`apps/guardian-ui/public/home/capture-landscape-<look>.png`.
