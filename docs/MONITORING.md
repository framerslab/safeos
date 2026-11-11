# Camera monitoring

Choose a camera in **Setup → Device Access** or above the camera feed on
**Monitor**. The choice is shared between these pages and saved in this browser.
Camera names may become available only after permission is granted. Device changes
refresh the list. If a saved camera is unavailable, reconnect it or choose another;
SafeOS does not silently replace an explicitly selected camera.

Opening Monitor leaves the camera and microphone off. **Start Monitoring** requests
access to the selected camera and microphone. The stream shows **Starting** until
the camera preview is ready; **Cancel Starting** cancels that request. A denied or
missing camera leaves monitoring inactive and shows the camera error.

**Stop Monitoring**, leaving Monitor, or cancelling startup releases all acquired
tracks and audio analysis resources. A browser permission prompt may remain open
after cancellation, but its eventual result cannot restart capture. Changing the
camera while monitoring releases the old feed before requesting the selected one.

An ended or muted video track stops monitoring, removes **LIVE**, and reports
lost coverage. Check the device and use **Start Monitoring** again. SafeOS does not
automatically resume after losing video coverage. An ended or muted microphone
stops audio analysis and shows a warning while video monitoring continues.

## Processing and connection

The Monitor preset's **Local** processing mode keeps camera frames on the device,
even when a server is connected. Other processing modes may send activity-triggered
frames to the configured server while monitoring is active. A socket connection
alone does not mean a camera is running. Metric updates keep the same socket;
leaving the page cancels its heartbeat and reconnect timer.

## Alert history

Monitor alerts are written to the existing `safeos-guardian` IndexedDB alert cache.
Monitor and **History → Local Timeline** restore the latest 100 alerts after a
reload. Stored monitoring history is also capped at 100 records. Acknowledgements,
dismissals and clearing alerts update only monitoring-owned records; alerts from
other producers in the shared database are left intact. Alert types and thumbnails
are retained.
Camera choice uses localStorage; camera streams and active monitoring state are
never restored from storage. Browser storage must be available for history to
survive a reload.

## Implementation and validation plan

Capture acquisition and cleanup stay in `CameraFeed`. Each acquisition has a
request generation so cleanup invalidates unfinished work. Monitor owns a separate
capture request and reports active monitoring only after video readiness. A shared
camera preference supplies the exact device constraint to Monitor and Setup.
Socket callbacks use refs; connection effects depend on connection configuration.
Server analysis starts when both video and the socket are ready, including after
a reconnect. Setup distinguishes missing devices from denied permissions, and
the picker keeps availability unknown while browser permissions hide device IDs.
Alert writes are ordered, and hydration preserves newer in-memory changes.

Regression tests render the pages and component with Testing Library. Media tracks,
permission promises, video playback, canvas, WebSocket, Notification and IndexedDB
are faked at browser boundaries. CI runs the tests, type checks, lint and static
build. Camera states need these controlled browser fixtures; ordinary Pictures
captures show the idle pages.
