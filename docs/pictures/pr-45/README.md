# Settings say what the watch does: pictures

Captures from CI's "Web app Lost & Found browser test" job, at 1280 pixels in
the light look, copied byte for byte from the job's artifacts. No image is
edited.

- `before/`: the `lost-found-browser-test` artifact of
  [CI run 44399165051](https://github.com/framerslab/safeos/actions/runs/44399165051),
  at `f53253bb2e93005a750025b1b0fd032345af4c3d`: the new walks on the code of
  master `92dd792`, before the fixes. Four are the screenshots Playwright saves
  when a walk fails (`test-failed-1.png` of the first try, renamed after the
  walk); the two pitch range pictures are the walk's own.
- `after/`: the `settings-pictures` artifact of
  [CI run 44409385992](https://github.com/framerslab/safeos/actions/runs/44409385992),
  at `1d73a5e0df25398a5a68f33c06e97efbd7be5bbb`, with the fixes.

| Picture | Before | After |
|---------|--------|-------|
| `detection-baby-row-1280.png` | Detection's Baby row on a fresh device reads Motion 35 and Audio 40 | It reads 80 and 80, the setting's values, which the watch runs at |
| `set-time-night-1280.png` | At 22:00 with a set time of Night, the watch runs at Maximum Alert | The watch runs at Night Mode |
| `quiet-hours-critical-1280.png` | A critical alert at 23:00 in Emergency Only quiet hours; no sound plays | The same alert; its sound plays at the alert volume, 60 |
| `lost-found-alert-1280.png` | The watch matches the striped pet; the sound saved for Lost Item Found is not played | The same watch; the sound plays |
| `sounds-played-1280.png` | | Custom Sounds shows the sound "Played 1x" |
| `pitch-range-100hz-1280.png` | A 100 Hz tone with a 300 to 3,000 Hz range reads about 16 % | It reads 0 % |
| `pitch-range-1000hz-1280.png` | A 1,000 Hz tone reads about 18 % | It reads about 18 % |

The volumes a sound plays at are not in a picture: the walk records them, and
the job's log prints them ("A critical alert in Emergency Only quiet hours
played at: ...").
