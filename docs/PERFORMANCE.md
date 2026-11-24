# Performance

## Measurements on slowed devices

The Measure workflow (`.github/workflows/measure.yml`) records how fast the
web app's watch, its detection model and Lost & Found matching run in
Chromium with the CPU slowed. It runs on each push to `master` and when it is
started by hand (Actions, Measure, Run workflow). It does not run on pull
requests. It records and does not judge: a slow number never fails the run,
and a part that could not be measured is written down with the reason.

Each run shows a table in its summary and keeps the `measurements` artifact:
`measurements.json` holds one object per device class and slow-down, and
every number in it carries its unit.

### The runner

A GitHub-hosted `ubuntu-24.04` runner. The job's first step prints the
runner's CPU model, its logical CPU count, its memory and its image, and the
script writes the CPU and memory into `measurements.json`. Numbers from runs
on different CPU models are not comparable.

The runner has no graphics card. Chromium offers WebGL there through
SwiftShader, its software renderer, and TensorFlow.js asks for its WebGL
context with `failIfMajorPerformanceCaveat` unless its `SOFTWARE_WEBGL_ENABLED`
flag is set
([canvas_util.ts at 4.22.0](https://github.com/tensorflow/tfjs/blob/tfjs-v4.22.0/tfjs-backend-webgl/src/canvas_util.ts)).
The app does not set that flag, so on the runner the model runs on
TensorFlow.js's CPU backend, as it does on a device whose browser offers only
software WebGL. The model figures are that backend's. A device with WebGL on a
graphics chip runs the model on WebGL, and these runs do not measure that.
The model measurement records the backend it got, the WebGL renderer and what
TensorFlow.js printed on the console.

### The device classes

| Class | Viewport | Touch | CPU slow-down |
|---|---|---|---|
| Phone | 390 by 844 CSS px, 3 device px per CSS px | yes | 4 times and 6 times |
| Laptop | 1280 by 800 CSS px, 1 device px per CSS px | no | none (1) and 2 times |

The slow-down is the Chrome DevTools Protocol's
`Emulation.setCPUThrottlingRate`, which "Enables CPU throttling to emulate
slow CPUs" with a "slowdown factor (1 is no throttle, 2 is 2x slowdown,
etc)" ([protocol definition](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Emulation.pdl)).
It is an approximation of a slower device, not a measurement on a named
phone or laptop: a phone's graphics chip, its memory, its heat limits and its
camera are not modelled. Each measured page times one fixed loop on its main
thread first (`calibrationLoop`), so each run shows how much slower the
slowed page really ran.

### The camera

Chromium's fake camera and microphone, fed from the committed sample clip
(`apps/guardian-ui/public/home/sample-clip.mp4`, made into a `.y4m` and a
`.wav` file with ffmpeg inside the job, as the Pictures workflow does), so
each page reads the clip through its real camera path. The clip loops.

### What is measured, and how

The script is `apps/guardian-ui/scripts/measure-devices.mjs`. It serves the
static export inside the job and gives each class and slow-down three fresh
browser contexts.

- **The watch (motion and sound).** `/monitor/` with motion and sound on and
  pixel detection off (`apps/guardian-ui/scripts/home-capture-settings.json`),
  started with its own Start watching key and watched for 60 s from its
  first camera read. A script added before the page's own scripts times
  each tick of the page's interval timers, inside the page. A tick that reads
  the camera's pixels (`getImageData`) is one analysed frame, except the
  first: it has no earlier frame to compare with and only keeps its frame for
  the next tick, so it is left out of the count and the times. A tick that
  reads the microphone's analyser is one sound reading. When the camera starts
  without its microphone, no tick reads the analyser, and the sound figures
  say not measured rather than zero. From these come the
  frames analysed per second (the motion timer runs every 200 ms, so 5 is the
  most), and the per-frame analysis time as a median and 95th percentile: the tick itself, in which the frame is drawn, its pixels
  are read and compared with the last frame, and the alert check runs. The
  same figure with the microtasks the tick queued is kept beside it. The
  watch also records the time from pressing Start watching to the first
  alert card on the page, and to the first motion and the first sound card
  apart. That time depends on when the clip first moves or sounds over the
  line as much as on the device. It records the JS heap in use after the 60 s
  (`performance.memory` with Chromium's precise memory figures on), as read
  and again after DevTools has run a garbage collection
  (`HeapProfiler.collectGarbage`, with `Runtime.getHeapUsage` beside it; when
  DevTools cannot run the collection, those figures are left unread and the
  table gives the reason), and
  the main thread's long tasks (over 50 ms) in the 60 s.
- **The detection model (COCO-SSD, used by Security and Wildlife).** A page
  the script hands to the browser loads the TensorFlow.js and COCO-SSD builds
  the app installs (`@tensorflow/tfjs/dist/tf.min.js`,
  `@tensorflow-models/coco-ssd/dist/coco-ssd.min.js`), picks the WebGL
  backend and loads `lite_mobilenet_v2` from the address in
  `apps/guardian-ui/src/lib/detection-model-facts.ts`, as
  `src/lib/detection-model.ts` does: through the loader's own load route,
  whose fetch looks in Cache Storage first and waits for each downloaded file
  to be written there before the load goes on. The route and the cache name
  are read from that file. The bytes are the model host's responses
  in Chromium's network log: the bodies after decoding, and the bytes on the
  wire with their headers. The load time runs from the start of the two
  script loads to the end of COCO-SSD's `load`, which runs the model once on
  an empty 300 by 300 picture before it returns
  ([2.2.3 build](https://unpkg.com/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js)).
  The inference time is `detect` on a 320 by 240 copy of the camera's frame,
  with at most 10 boxes at a 0.5 score line, as Security's person detector
  calls it. It runs back to back, 41 times or for 120 s, whichever ends
  first: the first run is reported on its own, and the median and 95th
  percentile come from the others (the table gives how many). Each part
  opens a fresh browser context with an empty cache, so each load is a first
  load: every file is downloaded and written to Cache Storage, and the table
  says whether the browser kept them. A model part that has
  not finished in 300 s is written down as not measured, with that reason,
  and the run goes on to Lost & Found.
- **Lost & Found.** One pet is enrolled through Lost & Found's own form from
  one frame of the clip (at 1 s). That page's Start Monitoring opens the watch
  with Lost and Found chosen and the pet, and the watch's Start watching
  starts it. The matching timer's ticks (every 500 ms) are timed the same way
  for 30 s: the per-frame matching time as a median and 95th percentile, and
  the frames matched per second.

### Reading a run

The table is on the run's summary page on GitHub. From a terminal:

```bash
gh run list --workflow measure.yml
gh run download <run-id> -n measurements  # measurements.json and summary.md
```
