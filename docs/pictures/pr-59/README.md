# Pictures for pull request 59

Captured by the Pictures workflow (Playwright, Chromium, on the built static
site) and copied byte for byte from the artifacts of
[run 45075636798](https://github.com/framerslab/safeos/actions/runs/45075636798)
on commit aa7d648, where every walk passed.

`after/`: the `pictures` artifact, the pull request's own build.

`before/`: the `pictures-before` artifact, the base commit c59795d, built and
captured by the same script.

The camera in every picture is a drawn canvas that the script hands to the page
in place of the device's camera.

| File | What it shows |
|---|---|
| `monitor-<width>-<look>.png` | `/monitor/` at 390 and 1280 pixels, not watching, with Motion and sound chosen |
| `monitor-lost-found-pet-<width>-<look>.png` | Lost and Found chosen, with a saved pet |
| `monitor-watch-starting-<width>-<look>.png` | While the camera starts. After: the key reads "Starting the camera…" with **Cancel** under the frame. Before: **Cancel Starting** |
| `monitor-watch-blocked-<width>-<look>.png` | A camera the browser blocked. After: the failure named inside the frame with its fix and **Try again**. Before: the camera box's error |
| `monitor-watch-watching-<width>-<look>.png` | Watching the drawn camera. After: the live picture in its corner ticks with the meters under it. Before: the page as it stood at the base commit |
| `monitor-watch-settings-<width>-<look>.png` | The watch's settings. After: **Show settings** open under **Settings for this watch**. Before: the page scrolled to its settings |
| `watch-try-again-other-tab-390-<look>.png` (after only) | **Try again** after a blocked camera while another tab watches: the question "Watch here instead? The other tab stops." |
| `watch-microphone-lost-390-<look>.png` (after only) | The frame after the microphone's track ended while watching: Sound names the microphone, and Motion and Picture change go on |
