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

## Watch for

Under the page's name, Monitor opens with **Watch for** and two options above the
camera and the settings: **Motion and sound** (chosen on a fresh device) and **Lost and
Found**. Motion and sound sounds an alert on this device when something moves or
makes a sound. Lost and Found does the same and, while the watch runs, compares
what the camera sees with a saved pet's photos, by colour and shape, one pet at a
time. Choosing either during a watch starts or stops the comparison at once with
no restart of the camera, and a polite status reads "Comparing with {name}'s
photos from {time}." or "Stopped comparing at {time}.". The page's title reads
"Motion and sound | SafeOS" or "Lost and Found | SafeOS".

The choice is setup's Lost & Found choice (`lostFoundChosen` in the onboarding
store): setup and Monitor show the same one, whatever the use setup saved, and
the Lost & Found page's **Start Monitoring** opens Monitor with Lost and Found
and the pet it shows. The pet is kept as `chosenPetId` in the Lost & Found store;
until one is chosen it is the newest saved pet. A thing saved on the Lost &
Found page as an object is the watch's only once it is chosen there or in
**Choose a pet**. A subject an earlier version saved as a person is never the
watch's pet, and the Lost & Found page offers no **Start Monitoring** for it.

With Lost and Found chosen, Monitor shows the pet's first saved photo, its name,
its count of photos, **Change pet** and the line "It can alert on an animal that
looks alike. It works best in daylight, with a pet whose colours stand out."
Under 1024 px they stand under the options (on a tablet the pet at the left and
the line at the right); from 1024 px they head the right column, and from 1440
px the pet's other photos stand under its photo. **Change pet** opens **Choose a
pet**, which lists every saved pet and thing with its photo and count; the arrow
keys move the check, a press (or Enter) chooses and closes, and Escape or
**Close** close it with no change. It stands above the page's navigation. With no pet saved, Monitor shows "No pet saved" and **Add a pet**, which
opens the Lost & Found page, and the camera's panel says "Without a saved pet, it
watches for motion and sound." While the saved pets are read it shows "Loading
saved pets…"; when they cannot be read it says "Saved pets could not be read on
this device. Reload the page to try again." and watches for motion and sound
until a reload. The pets and their photos are this device's, so Watch for and the
comparison work offline.

While the watch compares, the Lost & Found panel under the alerts shows the pet's
matches and links to its match history. A photo added there with **Add Photos**
counts at once on the pet and in **Choose a pet**, and stays with the pet when it
is chosen again.

Setup does not need the camera. Until access is granted, its **Device Access**
step shows **Continue without the camera**, which records camera and microphone
access as off and goes on; **Start Monitoring** asks for them later. After a
failed request the step says what happened and its key reads **Try again**:

| What happened | What the step says |
|---------------|--------------------|
| The browser or the person refused | The browser blocked the camera for this site. To allow it, open the site settings from the address bar, set Camera to Allow, then press Try again. |
| The camera did not start | The camera did not start. Another app or tab may be using it. Close it, then press Try again. |
| No camera, with **Default camera** chosen | No camera was found on this device. |
| The camera chosen in the menu is gone | The selected camera is unavailable. Choose another camera. |
| The browser has no camera support on the page | This browser cannot use a camera on this page. |
| Anything else | Unable to access the camera or microphone. Check the device and try again. |

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

## What the settings change on the watch

**Settings > Detection** lists the four uses with their Motion and Audio
sensitivity. A use with nothing saved for it shows the setting's values, the
ones a watch for that use runs at (80 and 80 on Maximum Alert, the setting a new
device starts on). Moving a use's slider saves that value for the use; **Reset
to defaults** clears it, and the use shows the setting's values again.

Under **Audio Frequency Filtering** the sound check reads the Audio level from
the pitches chosen: **Custom Range** reads the two pitches set below it and
the baby cry choice reads 300 to 600 Hz. The level is the loudness in the
analyser's bins inside the range, so a sound well outside it leaves the level near 0.
The analyser applies a Blackman window before its transform, so a tone just outside an
edge spreads into the nearest bin inside the range and can raise the level a little.
With a range set the analyser uses 2,048 points (about 23 Hz a bin at 48 kHz) in
place of 256. **All Frequencies**, **Pet Sounds** and **Elderly Fall Detection**
read every pitch.

**Scheduled Presets** on **Settings > Quiet Hours** apply on every page: the app
checks once a minute and whenever a set time or the Scheduled Presets switch
changes. A set time's setting goes on once each time the set time begins, and
when the app opens inside a set time it has not yet put on, after any saved
preferences are read. It goes on again when the set time in force is edited to
another setting, or when Scheduled Presets are turned off and on again during
it. Changes made while it lasts stay, a reload included, until the next set time
begins. An overnight set time (22:00 to 06:00) lasts into the next morning; its
days name the day it begins. A new set time's form opens on Maximum Alert, and a
set time that names a setting the app does not have puts nothing on.

A Lost & Found alert plays the sounds saved under **Settings > Sounds** for
**Lost Item Found**, beside the built-in alert sound, when the Lost & Found alert
sound is on. With Lost & Found's custom media on, the full-screen media takes the
built-in sound's place: the saved sounds play and the built-in alert sound does not. A saved sound that still plays is not started again by the next
matching frame, and it stops when the watch stops, when Lost & Found stops
watching or its pet changes, and when the page closes.

A saved sound for any alert plays nothing when the alert's volume is 0: in
Silent quiet hours, in Emergency Only quiet hours for an alert that is not
critical, and with the alert volume at 0. Emergency mode and the Emergency
trigger always play.

## When an alert comes again

Monitor has three detectors: motion, sound and pixel change. Each detector's event
starts once its readings have stayed at or over its line for a short window (half a
second for motion and sound, a quarter of a second for pixel change). Its first
alert comes once the cooldown for the reading's severity has passed since that
detector's last alert. The cooldowns are set on **Alert Escalation**
(`/settings/escalation/`) under **Per-Severity Cooldowns**: info 5 s, low 10 s,
medium 30 s, high 60 s and critical 0 s by default, so a new critical event alerts
at once.

While the readings stay over the line, the same event alerts again each time the
longer of two waits has passed since its last alert: the cooldown for the reading's
severity, and the **Cooldown Period** (30 s by default, set on the same page and as
**Alert Cooldown** in the Monitor page's settings). With the defaults a continuing
event repeats every 30 s at low, medium and critical, and every 60 s at high. When
the reading's severity rises above that of the event's last alert, the wait is the
new severity's cooldown alone, so a rise to critical alerts at once.

Each repeat plays the alert sounds, vibrates and shows the system notification
again, in place of the event's last one (each event has its own tag, which holds
when the severity changes, so a new event's notification stands beside an earlier
one; once an event has alerted at high or critical, each of its notifications
stays up until it is dismissed), and updates the event's card in the alert list in place: the card
shows the newest severity, reading and time, and "Repeated N times". History lists
the card at its newest alert, and the alert
panel's screen-reader announcement names the repeat count, so each repeat is read
out. Escalation counts from the event's first alert, so one event climbs the
escalation levels once. A card
that has been acknowledged stays as it is, and the next repeat makes a new card.
The same holds for a card acknowledged, dismissed or cleared in another tab: the
repeat reads the saved card in the same database transaction as its write, leaves
what the other tab did, and goes on a new card, which the event's later repeats update.
A custom sound set to loop for the alert's trigger plays one copy while it loops: a
repeat does not start a second copy on top of it, and counts no play in Settings >
Sounds.

The event ends once the readings have stayed under the line for the same short
window, so a sample or two under the line (a scene that holds still for a moment)
does not start a new event. It also ends when monitoring stops or starts, and when
its detector is turned off. A new event after that gets a new card and waits the
short window and its severity's cooldown.

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
tab, the dashboard lists the newest of those not marked as seen beside the other ways'
alerts and counts them on History's link, and anyone who uses SafeOS in this
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
A failed acknowledgement of a saved alert is retried as an update with no clear
comparison: it never creates a record, so it acknowledges an alert engine record that
Clear all kept, and writes nothing once a clear has removed the record. Each clear
writes a new clear generation in the database transaction that deletes the alerts,
and a new marker in local storage before that transaction ends. A pending save
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
