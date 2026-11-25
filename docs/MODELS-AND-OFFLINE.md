# Browser models and offline starts

Security and Wildlife use one COCO-SSD `lite_mobilenet_v2` model. Models settings
offers the same download. Opening these pages does not grant download agreement:
finish setup, then choose **Download detection model**. The first download is
about 19 MB from Google model storage. Camera frames are not sent with it.

The loader shares an in-progress request and a ready model between detectors.
A failed load clears the pending promise, so **Retry model download** or a route
return can try again. Agreement is retained locally. TensorFlow reads its manifest
and each weight shard through a cache-backed IO handler. Each successful response
is saved before it is returned. If the browser has no Cache Storage or will not
store a file (a private window, a full quota), the model still loads from the
network and the page says it could not be saved, so the next start needs a
connection. No monitoring page downloads the unused Transformers.js classifier.

Security's **Arm system** button stays disabled until the model is ready, so the
page never shows an armed system that checks no frame. Wildlife's **Start**
button works the same way.

People and Wildlife compare consecutive camera pictures before running the model.
They split the 320 by 240 picture into an 8 by 6 grid of 40 by 40 pixel cells.
The reading is the average absolute change in red, green and blue in the cell
that changes most, on a scale from 0 to 100. A cell reaching 15 starts the
model check by default. In Wildlife settings, **Movement to start the check**
sets that line from 5 to 50.

Offline starts require two completed preparations:

1. The service worker installs the exported HTML and all generated scripts,
   styles, fonts, route data and the images pages show (logo, favicons, logos,
   diagrams, the home page capture's WebP crops in both looks). The home
   capture's PNG copies, the shared-link card and the install screenshots are
   left out, so a first visit does not download them. The postbuild script derives the list and cache version from the
   actual output, using separate path and content-digest records for each file
   and a separate worker record. Installation fails if an asset cannot be saved. Route data the
   router requests with a query (`index.txt?_rsc=...`) is served from the
   installed copy. Alert sounds need no file: the browser generates them as
   tones, so they play offline.
2. For person or animal detection, the agreed model download must finish. The
   model cache is separate from app caches and survives app updates.

A worker serves one build consistently. A newer worker takes over as soon as it
has stored its whole build: it activates and takes the open tabs, so a returning
visitor gets the new build on the page load after the one that found it, not
after closing every tab. It keeps the build that ran before it, whose scripts and
styles a page loaded from that build may still ask for, and deletes every build
before that one. A page whose own script or style file is gone before React
starts (a deploy replaced it while the page loaded, or the browser kept the page
from before a deploy) reloads once onto the newest build: a script that runs first
in the page's head does it, by the same once-for-each-build rule. The load that finds a new build
shows the page the earlier worker stored, since a page is never swapped under a
running watch. A page already open keeps the scripts it loaded; one that then asks
for a file the new build replaced reloads once onto the new build (the app's error
page), once for each build, so a second deploy within five minutes still brings an
open tab across. A worker whose build could not be stored whole does not take over.
The worker file served before the postbuild step (`next dev`) carries no list:
it stores nothing, leaves every request to the network, and replaces a worker an
earlier build left on the same origin at once.
Model and unrelated caches are preserved. Browser storage can be cleared or
evicted; reconnect to restore missing app files or model weights. Server
integrations require a connection even when the app and model are saved.

## Implementation and validation

The change adds rendered-page regressions for consent, retry, the Models download
control, and persistent detection weights. Browser APIs and GPU execution are
replaced at their edges; TensorFlow's manifest and weight IO runs in the tests.
Worker install, activation and fetch handlers run against a fake Cache Storage.
CI also builds the static export and opens Wildlife offline in Chromium, then
operates its settings control. The browser check bounds service-worker readiness
to 30 seconds, reports the registration state on failure, and closes its browser
and HTTP server. Its command-line launch failure exits with a nonzero status.
Rendered home and FAQ regressions keep offline preparation, the available model,
and saved monitor alerts consistent with the implementation. All validation runs
in CI.
