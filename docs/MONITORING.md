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
Every alert already saved when this update opens the database is marked as saved
before the upgrade. All saved monitoring history stays available in Monitor and
**History → Local Timeline**, including history with no owner or an unusable date,
until the person dismisses it or uses the existing clear controls. These records
do not count toward either limit. No alert is ever removed because of its age.

For alerts written after the upgrade, the limits are 100 monitoring alerts per
person and 500 alerts across all producers and owners in this browser. At either
limit, acknowledged alerts are removed first, oldest first. Only when no
acknowledged candidates remain are the oldest unacknowledged alerts removed.
Thus newer acknowledged alerts can leave before an older unseen alert. Monitor's
in-memory list applies the 100-record per-person rule; changes caused by the shared
500-record limit appear on its next history read. Protected history is shown in addition to
these limits, so an existing browser can hold and display more than 500 alerts.

Writes enforce both limits in the same transaction. Indexes separate protected
history from new records and order new records by acknowledgement and creation
time. Monitoring reads and removals use the owner index. General alert lists and
their acknowledgements include shared records and only the selected owner's
monitoring records. Acknowledgements keep creation time, ownership, media and the
saved-before-upgrade marker.

The version 4 (or 5) to 6 upgrade adds these indexes in place and preserves every
existing alert and all other stores. Dates are normalized for indexing; unusable
original dates remain on the record alongside a usable display date. Authentication
initializes on every page. Alert readers wait for session setup to finish; a
localStorage profile alone cannot claim history. The profile must be restored
from or saved to IndexedDB before it becomes active. If the database cannot open,
SafeOS does not create or adopt a replacement profile. Previously unowned history
is claimed atomically by a database-backed profile when it reads the records.

When a session expires or a profile changes without sign-out, saving the new
session moves the previous browser session's monitoring records to the new
profile in the same transaction. Dates, acknowledgements and upgrade protection
stay intact. The records remain visible in Monitor, History's Local Timeline and
History's offline export, and the new profile can dismiss or clear them.
Explicit sign-out instead clears local data before another person can sign in.
If a browser history read fails, the current owner's displayed alerts stay in
place; the next read retries. A failed alert save also keeps that alert in the live
list and History's offline export, and the next history read retries the save.
Dismiss and clear remove pending saves too. An alert that has not been saved
cannot survive closing or reloading the tab.

An open connection closes when another tab requests a newer database version,
and its page asks the person to reload SafeOS. A new tab blocked by an older tab
shows “Close other SafeOS tabs, then reload this page to finish updating your saved
history. New alerts in this tab are not saved until you reload.” Alerts received
while either reload notice is shown are only in memory and are lost on reload.
Existing saved history returns after the database opens and session setup finishes.
The opener settles instead of waiting indefinitely. The reload notice uses the app's light and dark palette, with readable text in both looks. Tabs running a
version from before this change may need to be closed manually. Browser-only data
is not included in server exports; use History's local export for that data.

An alert acknowledged on Monitor is marked acknowledged in history, also when the server
cannot be reached. New acknowledged alerts remain subject to the count limits. Dismissals and clearing alerts remove only monitoring-owned
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
