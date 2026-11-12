# Camera monitoring

Choose a camera in **Setup → Device Access** or above the camera feed on
**Monitor**. The choice is shared between these pages and saved in this browser.
Camera names may become available only after permission is granted. Device changes
refresh the list. If a saved camera is unavailable, reconnect it or choose another;
SafeOS does not silently replace an explicitly selected camera.

Opening Monitor leaves the camera and microphone off. **Start Monitoring** requests
access to the selected camera and microphone. The stream shows **Starting** until
the camera preview is ready; **Cancel Starting** cancels that request. A denied or
missing camera leaves monitoring inactive and shows the camera error. A device with
a camera and no microphone monitors video alone and shows the microphone warning;
Setup's **Grant Permissions** also completes with the camera alone.

**Stop Monitoring**, leaving Monitor, or cancelling startup releases all acquired
tracks and audio analysis resources. A browser permission prompt may remain open
after cancellation, but its eventual result cannot restart capture. Changing the
camera while monitoring releases the old feed before requesting the selected one.

An ended video track (camera unplugged, switched off or taken away by the system)
stops monitoring, removes **LIVE**, and reports lost coverage. Check the device and
use **Start Monitoring** again. A muted video track (the device stops sending video
for a while) removes **LIVE**, shows **Camera paused**, sets the stream to
**Paused** and pauses frame analysis; when the track unmutes, monitoring resumes on
its own. An ended or muted microphone stops audio analysis and shows a warning while
video monitoring continues.

## Processing and connection

The Monitor preset's **Local** processing mode keeps camera frames on the device,
even when a server is connected. In the other modes Monitor sends activity-triggered
frames over the socket only while monitoring is active and video is live. The
bundled server's socket handler accepts frames that name a stream id and carry
`payload.imageData`; Monitor's frame messages carry neither, so the bundled server
does not store or analyse them. A socket connection alone does not mean a camera is
running. Metric updates keep the same socket; leaving the page cancels its heartbeat
and reconnect timer.

## Alert history

Monitor alerts are written to the existing `safeos-guardian` IndexedDB alert cache.
Monitor and **History → Local Timeline** restore the latest 100 alerts for the
current owner after a reload, using an owner-and-creation-time index instead of
loading the whole alert store. Each owner's monitoring history is capped at 100
records. The complete alert cache, including local-engine and sync records, is
capped at 500 records; the oldest records are removed first. Both kinds expire
24 hours after creation. The counts preserve the existing intended cache and
panel limits; 24 hours covers the longest monitoring session without keeping
an indefinite browser archive.

The database prunes history on opening, each alert write, and history reads.
Any history read also expires old records across owners using the creation-time index.
General alert lists and their acknowledgements include shared records and only the
selected owner's monitoring records.
Acknowledgement does not restart an alert's age or remove its owner and thumbnail. Monitoring reads and removals
are scoped to the current owner, including writes queued before an owner change.
The version 4 to 5 upgrade adds the index in place, retaining existing records
and other stores. Legacy monitoring records with no owner remain in the local,
unsigned-in history; they are not assigned to whichever account opens the app.
The upgrade normalizes valid dates and removes invalid dates before indexing or
counting retained history. Normal retention applies after opening. Browser-only data is not included in
server exports; use History's local export for that data.

An alert acknowledged on Monitor stays in history marked acknowledged, also when the server
cannot be reached. Dismissals and clearing alerts remove only monitoring-owned
records; alerts from other producers in the shared database are left intact. Alert
types and thumbnails are retained. A severity outside info, low, medium, high and
critical is shown as medium (emergency as critical).
Camera choice uses localStorage; camera streams and active monitoring state are
never restored from storage. Browser storage must be available for history to
survive a reload.

## Implementation and validation plan

Capture acquisition and cleanup stay in `CameraFeed`. Each acquisition has a
request generation so cleanup invalidates unfinished work. Monitor owns a separate
capture request and reports active monitoring only after video readiness. A shared
camera preference supplies the exact device constraint to Monitor and Setup.
Socket callbacks use refs; connection effects depend on connection configuration.
Monitor sends its start message when both video and the socket are ready,
including after a reconnect. Setup distinguishes missing devices from denied permissions, and
the picker keeps availability unknown while browser permissions hide device IDs.
Alert writes are ordered, and hydration preserves newer in-memory changes.

Regression tests render the pages and component with Testing Library. Media tracks,
permission promises, video playback, canvas, WebSocket, Notification and IndexedDB
are faked at browser boundaries. CI runs the tests, type checks, lint and static
build. Camera states need these controlled browser fixtures; ordinary Pictures
captures show the idle pages.
