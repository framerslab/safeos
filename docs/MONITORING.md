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

Monitor alerts are written to the `safeos-guardian` IndexedDB alert cache. Saved alerts
belong to the browser, not to a session or a profile: Monitor, **History → Local
Timeline** and History's offline export show the same records on every page and in every
tab, the dashboard shows the newest five of them, and anyone who uses SafeOS in this
browser sees them until someone signs out or clears local data. Reading and writing them
never waits for a session, and a replaced session changes nothing.

Every alert already saved when this version first opens the database is marked as saved
before the upgrade and stays until someone dismisses or clears it, whatever its date.
The upgrade waits until every tab running the previous version is closed or reloaded;
until then such a tab keeps that version's limit, and each monitoring alert it saves
leaves only the newest 100 monitoring alerts. The upgrade marks what is there when it
runs. Alerts saved afterwards are limited to 100 monitoring alerts and 500 alerts from
all producers; at either limit acknowledged alerts leave first, oldest first, and
unacknowledged ones only when no acknowledged ones remain. No alert is removed for its
age. Marked records do not count, so a browser can show more than 500. Monitor's
in-memory list applies the 100 rule; a change caused by the 500 limit shows at its next
history read.

Each record names its producer: `monitoring` for the monitoring store, `shared` for the
alert engine and the sync service. Monitoring reads and clears use the producer index,
and every write enforces both limits in its own transaction. An acknowledgement or any
later write keeps a saved alert's creation time, producer, media and mark; only a new
alert's time is limited to the present. Alert ids made in the browser carry a random
part. The upgrade to database version 7 rewrites each alert once and deletes none, and
it keeps an unusable date beside a usable one. If it cannot finish, the database stays
unchanged, the page says so, and a reload tries again. Versions 5 and 6 were never
released and upgrade the same way.

If a history read fails, the alerts on screen stay and the next read retries. A failed
save keeps the alert on screen and in History's offline export and is retried at the
next history read; an acknowledgement updates it, and dismiss and clear drop it. An
acknowledgement or a dismissal never creates a record: when the alert is no longer
saved, because another tab cleared or dismissed it or a limit removed it, nothing is
written, and an acknowledged alert leaves that tab's list. Clear All Local Data, a
sign-out or Clear all, in any tab of this browser, cancels every tab's pending saves.
Each clear writes a new clear generation in the database transaction that deletes the
alerts, and a new marker in local storage before that transaction ends. A pending save
that holds a generation is written only by a transaction that reads the generation and
finds it unchanged; one whose tab had read no generation under the marker in force when
the alert was queued holds only that marker, and is written only if the marker it reads
inside that transaction is unchanged. One limit: a browser may show one tab's local
storage write to another tab a moment late, so in the instant of a clear in another tab
a pending save can still be written, and a new alert whose first save fails may not be
saved. Dismissing one alert reaches only its saved record: a tab that still waits to
retry that alert's failed save shows it and saves it again at its next history read,
where it can be dismissed again. An alert that was never saved does not survive closing
or reloading the tab. The alert engine alerts first and saves afterwards.

A tab closes its database connection when another tab opens a newer database version,
and a tab opened while an older tab still holds the earlier version says so instead of
waiting; tabs from before this change must be closed or reloaded by hand. A tab whose
code is older than the saved database shows the same notice as for an update in another
tab. Each such tab shows a notice with a reload button and saves nothing until it is
reloaded: new alerts are shown, sounded and notified but not saved, and acknowledging,
dismissing or clearing changes the screen only. Whenever the database cannot be opened,
with a notice or without one, a tab that holds a session token for a monitoring server,
in memory or kept in local storage, goes on using it for that server's alerts and makes
no new session; a tab that holds none makes one as before and keeps it in memory and
local storage. One case differs: a session that ran out on this device just as a notice
came is kept, and that server's alerts pause in that tab until it is reloaded. A tab
that starts in that state asks the server about the token it holds. If the server
answers OK, the tab is signed in with that session's profile, in memory. If the server
answers 401, that session has ended: the tab uses a newer token that another tab has put
in local storage, or else makes a new session, kept in memory and local storage. A
network failure or any other answer keeps the token, without a profile until the next
load. After a reload with the database open, the session saved there is used. While a
notice is shown, signing out and Clear All Local Data are refused until the reload,
after which everything saved is shown as it was. Otherwise signing out, in any tab, and
Clear All Local Data clear every local store for the whole browser. The notice is
readable in the light and dark looks. Browser-only data is not included in server
exports; use History's local export for that data.

An alert acknowledged on Monitor is marked acknowledged in history, also when the server
cannot be reached. New acknowledged alerts remain subject to the count limits. Dismissals and clearing alerts remove only the monitoring store's
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
