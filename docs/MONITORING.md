# Camera monitoring

Choose a camera in **Setup → Device Access** or under the camera's frame on
**Monitor**. The choice is shared between these pages and saved in this browser.
Camera names may become available only after permission is granted. Device changes
refresh the list. If a saved camera is unavailable, reconnect it or choose another;
SafeOS does not silently replace an explicitly selected camera.

Opening Monitor leaves the camera and microphone off. Until the camera runs, a
drawn frame holds **Start watching** and, until this site may use the camera, the
line "Your browser will ask you to allow the camera and microphone." **Start watching**
requests access to the selected camera and microphone; while the camera starts the
key reads "Starting the camera…" and **Cancel** under the frame cancels that
request. A camera that fails is named inside the frame with its fix and, where a
press can help, **Try again**. While another tab of this browser watches, **Try
again** asks "Watch here instead? The other tab stops." first, as **Start
watching** does. Once the live picture shows, it stands in four corner ticks and
**Stop watching** stands under it. On a phone the alert list follows **Stop
watching** while the watch runs, so the newest alert shows in the first screen,
and the camera menu stands under the list. A device with a camera and no microphone, or
one whose camera is allowed and whose microphone is blocked, watches video alone,
from the watch's own key and from the dashboard's, and the Sound meter names the
missing or blocked microphone while Motion goes on; a microphone lost while watching is named there as missing.
A polite status says the microphone's problem once, and never a reading.
Setup's **Grant Permissions** also completes with the camera alone.

## The meters

Under the live picture, a strip holds a meter for each kind the setting in use
checks: **Motion**, **Sound** and **Picture change**. Each meter shows its name, a
word for its state ("Quiet", "Over the line", or "No alert" where the setting turns
that kind's alerts off) and a bar on a track with the alert line drawn across it:
the bar fills in green up to the line and in the alert colour past it. With
detection zones, the Motion meter reads the zone that stands highest over its own
line, a full-screen zone's own Motion sensitivity included, as its alert does.
Before the first reading after a press the names stand over empty tracks with no
state word, and a new watch's meters start from its own camera's readings, never
from the last watch's; so do the meters of another camera chosen while watching.
When the camera stops, focus on a key that stays on the page (a setting) stays
there; focus on a key that goes, such as Stop watching, moves to the frame's key.
On a phone the camera menu moves from under the alert list to under the frame, so
focus on it moves to the frame's key too. **Picture change** reads on the scale its check uses: the
changed pixels against the pixel count, or, where the setting checks a share of the
picture, the changed share against the check's 1 per cent.
The alert's severity uses the same line. From that line up to twice it the
alert is low. It is medium at twice the line, high at five times, and critical
at ten times. In a pixel-count zone the alert uses the line for that zone.
A screen reader reads each meter's value as "{n} per cent, line at {line}, {state}";
a change of state is not announced. Under reduced motion a meter's shown reading
changes at most once a second. While Lost and Found compares, the pet's meter names
the pet and reads "Comparing with {name}'s photos", with no bar and no number. On a
phone each meter is one row; from a tablet they stand side by side, and from
1024 px each meter's name and state word keep one line over its bar, a longer
state word widening its column.

## Settings for this watch

The watch's settings fold under one row below the alert list, **Settings for this
watch**, with **Show settings** at its right; a press anywhere along the row opens
them in place and the key reads **Hide settings**. The choice is kept on this
device (`safeos-watch-view`, cleared by **Clear all data on this device**). Open, they hold the
link **Nap Mode**, the preset card (its name, description, Pixel Threshold, Motion
and Audio, **Calibrate Baseline**, Fine-Tune) and the detection settings, whose mode keys
include **Deep sleep** (Deep Sleep Ultra-Sensitive). The preset card's **Interval**
and the **Analysis Interval** sliders (Fine-Tune and Sensitivity) show only while
this device's own server is connected: they set how often frames go to that server.

## The alert list

The alert list stands on the page under the heading **Alerts**; while any alert is
new, the count of new alerts stands beside it. With no alert in the list it says
"Alerts show here while this device watches." before a watch and "No alert so
far." while watching; while the saved alerts are read, three bars hold the
entries' place. When this device's storage refuses the saved alerts, the problem
glyph and "Alerts could not be saved on this device. They show here until you
reload." stand under the heading, and the list goes on under them for this visit.
Under the list (beside the picture from 1024 px) stands the statement "SafeOS adds
an alert. It does not replace a person nearby. A phone or a browser can sleep, lose
power or drop the camera, so stay within reach."

While another tab watches, **Start watching** asks "Watch here instead? The other
tab stops." with **Watch here** and **Keep the other tab**; focus starts on **Keep
the other tab**, and it or Escape closes the question and gives focus back to
**Start watching**.

## Watch for

Monitor opens with one row, at every width from 320 px: **Watch for** and **Mute
alerts**. While alerts are muted, a line under the row reads "Alerts are muted. New
alerts show here without a sound. One left unanswered until it reaches Emergency
sounds its alarm.": the Emergency step of an unanswered alert always sounds. Two options stand in that row from 1024 px and under it below, above the
camera and the settings: **Motion and sound** (chosen on a fresh device) and **Lost and
Found**. Motion and sound sounds an alert on this device when something moves or
makes a sound. Lost and Found does the same and, while the watch runs, compares
what the camera sees with a saved pet's photos, by colour and shape, one pet at a
time. Choosing either during a watch starts or stops the comparison at once with
no restart of the camera, and a polite status reads "Comparing with {name}'s
photos from {time}." or "Stopped comparing at {time}.". The pet's name over the
camera's picture has no key of its own: Watch for is the one place the comparison
starts and stops. The page's title reads "Motion and sound | SafeOS" or "Lost and
Found | SafeOS".

The choice is setup's Lost & Found choice (`lostFoundChosen` in the onboarding
store): setup and Monitor show the same one, whatever the use setup saved, and
the Lost & Found page's **Start Monitoring** opens Monitor with Lost and Found
and the pet it shows.

The address names the way and the pet: `/monitor/?way=lost-found&pet=<id>` opens
Lost and Found with that saved pet, `/monitor/?way=monitor` opens Motion and sound,
and an address with no way keeps the stored choice. The address is read once the
saved pets are read; a way or a pet chosen on Watch for before then stands, and is
written to the address. Each change of way or pet on the page writes the address
in place, and so does a choice on Watch for that differs from what the address
names (Motion and sound chosen where the address names Lost and Found and the pets
could not be read), so a bookmark or a reload of that address
opens the same watch; `/monitor/` opened with no way follows the choice this device
keeps, and so does a bookmark of it. The pet is kept as `chosenPetId` in the Lost & Found store;
until one is chosen it is the newest saved pet. A thing saved on the Lost &
Found page as an object is the watch's only once it is chosen there or in
**Choose a pet**. A subject an earlier version saved as a person is never the
watch's pet, and the Lost & Found page offers no **Start Monitoring** for it;
opening such a person there, or closing it again, leaves the chosen pet as it
is. Setup run again on a device with another use (a baby device with Lost and
Found chosen on Monitor) shows Lost & Found chosen, and its **Continue** keeps
the device's use: only a press of a use's card changes it.

With Lost and Found chosen, Monitor shows the pet's first saved photo, its name,
its count of photos, **Change pet** and the line "It can alert on an animal that
looks alike. It works best in daylight, with a pet whose colours stand out."
Under 1024 px they stand under the options (on a tablet the pet at the left and
the line at the right); from 1024 px they head the right column, and from 1440
px the pet's other photos stand under its photo. **Change pet** opens **Choose a
pet**, which lists every saved pet and thing with its photo and count; the arrow
keys move the check, a press (or Enter) chooses and closes, and Escape or
**Close** close it with no change. It stands above the page's navigation. With no pet saved, Monitor shows "No pet saved" and **Add a pet**, which
opens the Lost & Found page, and the camera's frame says "Without a saved pet, it
watches for motion and sound." While the saved pets are read it shows "Loading
saved pets…"; when they cannot be read it says "Saved pets could not be read on
this device. Reload the page to try again." and watches for motion and sound
until a reload. The pets and their photos are this device's, so Watch for and the
comparison work offline. A long name with no spaces breaks inside the line that
names the pet, at every width from 320 px.

While the watch compares, the meter under the live picture names the pet.
Add photos on the Lost & Found page. Setup’s **Alert line** sets the point where
the comparison raises an alert. **Saved pictures** on the Lost & Found page opens
the pictures kept for the pet's sightings beside the frames earlier versions
saved. The pet's card counts both. Open a picture to see its time and the
question "Could this be {name}?". A sighting's picture shows its box and any
close-up. Deleting the picture here also removes it from History. The sighting's
words stay. Deleting the pet deletes its saved pictures the same way, and a picture of it
that is being saved is not kept. Pictures this
device cannot read, cannot delete, or cannot mark as exported, are named in the gallery.
The watch links to **Open in History**, which opens History on its Local Timeline,
also on a device that uses a server. Choosing another pet starts a new comparison
without restarting the camera.

When another tab of this browser clears all local data (**Clear all data on this
device**, or a sign-out), the open watch drops the pets it had read and ends the
comparison: it says "Stopped comparing at {time}.", shows "No pet saved", and
goes on watching for motion and sound. A read of the saved pets on its way at
that moment shows none of them. The watch hears of the clear from the account marker
in local storage, which a browser may show to another tab a moment late.

Setup does not need the camera. Until access is granted, its **Device Access**
step shows **Continue without the camera**, which records camera and microphone
access as off and goes on; **Start watching** asks for them later. After a
failed request the step says what happened and its key reads **Try again**:

| What happened | What the step says |
|---------------|--------------------|
| The browser or the person refused | The browser blocked the camera for this site. To allow it, open the site settings from the address bar, set Camera to Allow, then press Try again. |
| The camera did not start | The camera did not start. Another app or tab may be using it. Close it, then press Try again. |
| No camera, with **Default camera** chosen | No camera was found on this device. |
| The camera chosen in the menu is gone | The selected camera is unavailable. Choose another camera. |
| The browser has no camera support on the page | This browser cannot use a camera on this page. |
| Anything else | Unable to access the camera or microphone. Check the device and try again. |

On the watch, a selected camera that is unavailable and is connected again clears
its failure once the browser lists it, and the frame offers **Start watching**.

**Stop watching**, leaving Monitor, or cancelling startup releases all acquired
tracks and audio analysis resources. A browser permission prompt may remain open
after cancellation, but its eventual result cannot restart capture. Changing the
camera while monitoring releases the old feed before requesting the selected one.

An ended video track (camera unplugged, switched off or taken away by the system)
stops watching, and the frame says "The camera stopped at {time}. Press Start
watching to start again." with **Start watching** under it. A video track that ends
before the first picture is a failed start: the frame names it with **Try again**. A muted video track (the
device stops sending video for a while) pauses frame analysis, and the frame says
"The camera is not sending a picture. Watching resumes when the picture returns."
with **Stop watching** under it, as it does while another camera chosen during a
watch starts; when the track unmutes, watching resumes on its own. An ended or muted microphone stops audio
analysis while video watching continues, and the Sound meter says "No microphone
found. Sound alerts are off. Connect a microphone, then stop and start watching."

## What the settings change on the watch

**Settings > Detection** lists the four uses with their Motion and Audio
sensitivity. A use with nothing saved for it shows the setting's values, the
ones a watch for that use runs at (80 and 80 on Maximum Alert, the setting a new
device starts on). Moving a use's slider saves that value for the use; **Reset
to defaults** clears it, and the use shows the setting's values again.

Under **Audio Frequency Filtering** the sound check reads the Audio level from
the pitches chosen: **Custom Range** reads the two pitches set below it and
the baby cry choice reads 300 to 600 Hz. A range of up to 128 bins reads the root
mean square of the analyser's bins inside it; the baby cry range holds 13 bins at
48 kHz. Up to 128 bins, a wider range spreads a sound's energy over more bins and
reads it lower. A range wider than 128 bins reads the energy of its bins against
128 bins (every bin at the 256 points that every pitch is read with), so widening
a range past 128 bins never lowers the level of a sound inside it. A 1,000 Hz tone
reads about 5 per cent higher at 300 to 3,000 Hz (116 bins at 48 kHz) than at 20
to 20,000 Hz. A sound well outside the range leaves the level near 0.
The analyser applies a Blackman window before its transform, so a tone just outside an
edge spreads into the nearest bin inside the range and can raise the level a little.
With a range set the analyser uses 2,048 points (about 23 Hz a bin at 48 kHz) in
place of 256. **All Frequencies**, **Pet Sounds** and **Elderly Fall Detection**
read every pitch, as the root mean square of every bin, so a sensitivity saved
for them means what it did.
The old noise filter switch is gone. Devices that used it keep their pitch settings.

**Scheduled Presets** on **Settings > Quiet Hours** apply on every page: the app
checks once a minute and whenever a set time or the Scheduled Presets switch
changes. A set time's setting goes on once each time the set time begins, and
when the app opens inside a set time whose setting it has not put on, after any
saved preferences are read. Preferences an account brings when it is restored
after that leave the sensitivities and the volume at the set time's values. It
goes on again when the set time in force is edited to
another setting, or when Scheduled Presets are turned off and on again during
it. Changes made while it lasts stay, a reload included, until the next set time
begins. An overnight set time (22:00 to 06:00) lasts into the next morning; its
days name the day it begins. A new set time's form opens on Maximum Alert and
offers the named settings; Custom is not one, as it has no values of its own to
put on. A set time saved earlier with Custom, or with a setting the app does not
have, shows "This schedule needs a setting chosen. Press Edit to choose one;
until then it never applies.": it never applies, and never outranks a set time
that has a named setting.

A Lost & Found alert plays the sounds saved under **Settings > Sounds** for
**Lost Item Found**, beside the built-in alert sound, when the Lost & Found alert
sound is on. The full-screen pictures ask "Could this be {name}?" and say
"Colours and shape like {name}’s photos." They speak "Colours like your pet’s
photos are in view." unless you saved a line of your own. They take the keyboard's
focus when they open, keep Tab on their own keys, and give focus back when they close. With Lost & Found's
custom media on, the full-screen media takes the
built-in sound's place: the saved sounds play and the built-in alert sound does not. The
sounds come with each of a sighting's alerts (see **A Lost and Found sighting** below), never
with every check. A saved sound that still plays is not started again by the sighting's next
alert, and it stops when the watch stops, when Lost & Found stops
watching or its pet changes, and when the page closes. A start on its way when
the watch stops plays nothing, a sound set to repeat starts no further pass once
it has stopped, and a loop that a motion or sound alert plays too keeps playing
while monitoring goes on and stops when the watch stops, also when **Watch for**
moved to Motion and sound while it played.

A saved sound for any alert plays nothing when the alert's volume is 0: in
Silent quiet hours, in Emergency Only quiet hours for an alert that is not
critical, and with the alert volume at 0. The volume is read at the instant the
saved sound starts, so quiet hours that began or ended a moment ago hold for it.
Emergency mode and the Emergency trigger always play.

## Spoken alerts

People, Wildlife and Lost and Found’s custom spoken messages use a voice on
this device by default. SafeOS’s own alert words are English and take an
English voice when the device has one; a device with no English voice reads
them with a voice it has, so the alert is heard. A message you write takes a
voice in the language of the page.
A browser can take a moment to list its voices, so an alert waits up to a
second for the list. A newer alert replaces one that is still waiting, and a
Lost and Found message that waits through a pause speaks once the pause ends. If
the browser offers no voice on this device, spoken alerts stay quiet. A Lost
and Found message with no voice to read it waits, and speaks once the browser
lists one. **Settings > Alert sounds > Spoken alert voice** lets you
choose a specific online voice when the browser offers one. When the chosen
voice speaks another language, SafeOS's English words take an English voice on
this device, if there is one. Some browsers'
voices send the alert's words to the browser maker. Choose **Use a voice on
this device** to return to the default. Settings reads the browser's voice
list again after a second, for a browser that fills it without saying so, and
a screen reader hears when the voices on offer change.

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
shows the newest severity, reading and time, and "Repeated N times". History and the
dashboard's **Since you last looked** list the card at its newest alert, and the alert
panel's screen-reader announcement names the repeat count, so each repeat is read
out. Escalation counts from the event's first alert, so one event climbs the
escalation levels once. A card
that has been acknowledged stays as it is, and the next repeat makes a new card.
The same holds for a card acknowledged, dismissed or cleared in another tab: the
repeat reads the saved card in the same database transaction as its write, leaves
what the other tab did, and goes on a new card, which the event's later repeats update.
The new card sounds and escalates while the watch that raised the old card runs; a
repeat that lands after that watch ended goes on a silent card. An alert the
monitoring server sends for another stream than the running watch's (a late alert of
a watch that has ended) is listed as new and stays silent.
A custom sound set to loop for the alert's trigger plays one copy while it loops: a
repeat does not start a second copy on top of it, and counts no play in Settings >
Sounds.

The event ends once the readings have stayed under the line for the same short
window, so a sample or two under the line (a scene that holds still for a moment)
does not start a new event. It also ends when monitoring stops or starts, and when
its detector is turned off. A new event after that gets a new card and waits the
short window and its severity's cooldown.

## A Lost and Found sighting

While the watch compares, each check (twice a second) scores what the camera sees against the
pet's photos. A check at or over the alert line is a sighting. A run of sightings is one alert
entry: its first sighting raises the alert, and while sightings go on the same entry alerts
again each time the **Cooldown Period** has passed, with "Repeated N times". A run ends after
30 seconds with no sighting, and when the watch stops or its pet changes; the next sighting
after that makes a new entry. Each entry keeps one picture set in `alert_picture` while
**Keep alert pictures** is on. The gallery and History open that same picture. The watch
writes no frame for each check. Frames earlier versions saved in `match_frame` stay in
the gallery and History until their own delete controls or **Clear all data on this device**.
The panel's recent readings, the newest 20 checks that scored with their frames, stay in
this tab's memory alone and go when the page closes. History lists an earlier frame with
its own thumbnail and "Could this be {name}?", with no score.

The entry asks "Could this be {name}?" with the time, and says "Colours and shape like
{name}'s photos." and "Compare the two pictures. It can be another animal that looks alike.".
It shows the camera's picture of that check with a box round the part of the frame that scored
(the comparison's region) and, side by side under it, the close-up of that box and the pet's
first saved photo, labelled "Close-up" and "{name}'s saved photo" under them. It has no level and takes no part in the list's escalation; its sound is
Lost Item Found's, at each of its alerts. Its notification, when Lost & Found's notifications
are on, has the title "Could this be {name}?" and the body "Colours and shape like {name}'s
photos, {time}."; with **Show the picture in alert notifications** on it carries the camera's
picture with its box drawn in, and the pet's photo is never in it. The live picture boxes the region for 10
seconds with "Colours like {name}'s". History lists the entry under Lost & Found. The
dashboard's **Since you last looked** lists it as Lost and Found's, "Colours like {name}'s at
{time}", with its kept close-up (the camera's picture when it has no close-up), and **Mark all
as seen** marks it in the watch's list. The entry's record in the alert cache has the kind
`sighting`, the pet's id and name and the comparison's four scores as data; no score and no
percentage is shown.

## Alert pictures

Each Motion and Picture change alert keeps the camera's picture of the moment: the frame of
the check that raised the alert, at the camera frame's own shape, 640 px on its long edge and
never enlarged, as a JPEG at quality 0.7. One box marks what set the alert off: for Motion,
the cells of the 16 by 12 grid that changed between the check's two frames, inside the zone
that set it off where zones are set; for Picture change, the spots whose pixels changed, inside
the zone that set it off where zones are set and it names one. A
close-up of that box comes with it: the box widened by an eighth of its width and height on
each side, cut from the camera's full frame, at most 480 px on its long edge, as a JPEG at
quality 0.8. There is no close-up where the box covers more than half of the frame, and a
Picture change alert whose box covers more than half of the frame keeps the picture with no
box. A Sound alert keeps the picture with no box and no close-up. A Lost and Found sighting
keeps the camera's picture with the comparison's region as its box. A picture whose mean
brightness is under 26 of 255 says it is too dark to show much.

The newest card in the alert list shows the picture large with its box and the close-up beside
"Close-up"; every other card shows one 112 by 84 px thumbnail. A repeat replaces the card's
pictures with the newest alert's; a picture that could not be saved keeps its line when a newer
alert moves it to a thumbnail. For 10 seconds from a Motion or Picture change alert, the
live camera picture inside the watch frame shows the box with "Motion here at {time}" or "Picture change here at
{time}"; a newer alert's box takes its place. The box leaves when another camera is chosen, and
it is not drawn while the camera is paused. **Open picture** on a card, or a press on its
picture, opens the picture large: **Show the box** hides and shows the box, **Save picture**
saves the picture as it shows to the device as `safeos-{kind}-{date}-{time}.jpg` (with the box
drawn in while it shows), and **Delete picture** asks first, then deletes the picture, its box
and its close-up; the alert's words stay. A delete confirmed while **Save picture** makes its
file goes ahead once the file is made, also when the picture was closed meanwhile, and a picture
opened since stays open. A repeat while the picture is open puts the newest
alert's picture in its place; a delete question, or a failed save or delete, that was about the
earlier picture leaves with it, and a delete of the earlier picture leaves the newer one open. A
dark picture offers **Brighten the picture**, which
brightens the view alone; a brightened view shows only with the picture it was made of. A
control that leaves the open picture with a repeat (**Brighten the picture**, when the newer
picture is not dark) leaves focus on **Close**. **History → Local Timeline** lists each watch alert with its
thumbnail, its kind, level, date and time, and **Open picture**.

The pictures are kept in the `alert_picture` store of the `safeos-guardian` database
(version 8) as JPEG Blobs, one set an alert, named by the alert's `pictureId`. A sighting's set
names its pet, and a pet's delete leaves a `deleted-pet:` note in `clear_generation` that keeps
out a set saved after it, until the pet is saved again or all local data is cleared. No picture,
box or close-up goes to a server, the socket, the sync service, a log line or an error
report, and no data URL of a picture is stored.

Before a device's first watch, any key that starts the watch opens the notice "Each alert
keeps a picture": what an alert keeps, that the pictures stay on this device and anyone who
can open SafeOS in this browser can see them, when to ask first, and what the law may say of a
camera that sees a street or a neighbour's home. It carries the **Keep alert pictures** switch
and **Delete pictures after** (1, 3, 7 or 30 days, or "Until I delete them"; 3 days unless
chosen). **Start watching** keeps the choice and starts the watch; **Go back** starts nothing
and the notice opens again at the next start. The dashboard's start key opens it on Motion and
sound's page before the watch, and there **Go back** also closes the camera the dashboard opened
for that start and ends the Lost and Found watch for the pet that start began. No picture is
kept before it is answered. A first watch from Nap Mode or **Resume nap** opens the notice
before starting the camera. An answer given in one tab holds in every open tab, also where the
browser keeps no choices: the other tabs start their watch with no notice.
Setup's camera step shows the same title, switch, choice and lines: going on past that step
(**Continue**, or **Continue without the camera**) answers the notice with the choice as set
there, so the first watch starts with no notice, and deletes the pictures past the age chosen
there; **Back** answers nothing. Running setup again
keeps that choice with the step's other answers until its last step is finished. The
same switch, choice and lines stand in **Alert pictures** under **Settings for this watch**
and on **Settings > Detection**, with the count of pictures kept and **Delete all pictures**,
which asks first. While the pictures are deleted, focus stays on that key or wherever the
person moves it; when the key leaves with the last picture, focus on it goes to **Delete
pictures after**. With keeping off, each alert's picture shows on the watch until a reload and
nothing is saved. Turning the switch in one tab holds in every open tab from the next alert,
and a new age at once; a tab that hears of a choice after a later one was made, or one made in
the same millisecond as its own, changes nothing for it, and a choice made after hearing another
tab's is the later one, even in the same millisecond. A sweep by an age deletes nothing once a
longer age, or "Until I delete them", has been chosen while it waited for the store or wrote.

A picture is deleted:

- at the age chosen under **Delete pictures after**, by a sweep when a watch starts, every
  minute while it runs, when History opens and when the age is changed, in every open tab by
  the age just chosen; its card says "Its picture was deleted after {n} days.";
- with its alert, when the alert leaves under the alert limits (see **Alert history**), in
  the same write, and when a repeat gives its card a newer picture or, with no frame to take,
  none; a picture being
  drawn when its alert leaves is saved with no alert to hold it, and the sweep of pictures no
  alert holds deletes it when a watch starts, once it is 10 minutes old;
- by **Delete picture**, by **Delete all pictures**, by **Clear all data on this device** (on
  Settings, Data on this device) and by signing out.

A picture being saved when **Delete all pictures** comes, in any tab, is not saved. When
the deletion fails, nothing is deleted and that picture is saved, as is a picture taken while the
failing deletion was finishing. A picture another tab deletes
before it is saved (a tab that could not read it) stays deleted. **Clear all data on this device**
and signing out, in any tab, close the open picture in every tab and leave no picture on screen, and
a picture read or drawn from before the clear shows nothing; the count of pictures kept is read
once the clear is done.

When the device runs out of room, the oldest pictures make way for the newest, and the alert
list says so once; when the new one finds no room even with every older picture gone, nothing
is deleted, the new one is not kept, the list says the device is out of room, and so does the
dashboard for the rest of the visit. A
window that keeps no data says once that it keeps no
pictures. A tab whose database waits for a reload shows its alerts' pictures from memory.
Another tab that shows an alert before its picture is saved shows the picture once it is.
A picture a repeat replaced is let go from the tab's memory two minutes after no card shows it
and no alert names it, also once the watch has stopped.

**Settings > Notifications** has **Show the picture in alert notifications**, off by default.
With it on, in a browser that shows a picture in a notification, a Motion or Picture change
alert's notification carries the picture with its box drawn in; a picture not drawn within
300 ms of the alert leaves the notification's words to go alone. An event's notifications go to
the browser one after another, in the order they are ready: one ready after a newer alert of its
event asked for its own does not go, and a slower answer from the browser never puts an earlier
one over a later one. A Sound alert's notification
never carries a picture. The notifications say "Motion alert", "Sound alert" or "Picture
change alert", with the level and the time. While the browser shows a notification's words
alone, while notifications are not allowed (the row offers **Allow notifications**) and while
they are blocked, the switch is inactive and says why. The row reads the browser's answer
again when the page comes back into view, so notifications allowed in the site settings make
the switch usable with no reload. Turning the switch in one tab holds in every open tab from the
next notification. Turned off while a notification's picture is drawn, or while the notification
waits its turn behind an earlier one of its event, it sends that notification with its words alone.

## People and Wildlife alerts

People shows how many people are in view. Above the allowed count, the alert and
its browser notification say when the watch saw them and that the count is more
than this watch allows. The alert stays on the page with its **DISARM** key until
the watch is disarmed, also once the people have left. It gives the count and
time of the alert the watch saved. While the count stays above the allowed
count, a check inside the cooldown saves nothing and leaves the alert as it is.
When the count falls to or below the allowed count and then rises above it, the
watch saves a new picture and the alert takes its count and time. Saved pictures
keep the count and the time. The **History** key shows them. Voice warnings play
on the watching device.

Wildlife shows an animal's name and the time of the sighting. The browser
notification gives the same information. Each sighting that alerts stays under
**Sightings to clear** until **Clear All** or the end of the watch, also once the
animal has left. The **Alert line** in Wildlife Settings
shows a number. Raising it makes the watch more selective about which sightings
it shows.

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

People keeps up to 100 saved pictures on this device. When it saves a picture
or opens an older library over the limit, it removes the oldest seen pictures
first, then the oldest unseen pictures. An alert stays seen if its only marked picture makes room and it still has
other pictures.
The People picture library, Wildlife sightings and pictures kept by an
earlier version of Lost and Found have no automatic deletion by age. The
**Delete pictures after** choice applies to the alert pictures described above.

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
age; its picture is, at the age chosen under **Delete pictures after**, and the alert's words
stay. An alert that leaves under a limit takes its kept picture with it in the same write. Marked records do not count, so a browser can show more than 500. Monitor's
in-memory list applies the 100 rule; a change caused by the 500 limit shows at its next
history read.

Each record names its producer: `monitoring` for the monitoring store, `shared` for the
alert engine and the sync service. Monitoring reads and clears use the producer index,
and every write enforces both limits in its own transaction. An acknowledgement or any
later write keeps a saved alert's creation time, producer, media and mark; only a new
alert's time is limited to the present. Alert ids made in the browser carry a random
part. The upgrade to database version 7 rewrites each alert once and deletes none, and
it keeps an unusable date beside a usable one. The upgrade to version 8 adds the
`alert_picture` store and keeps every alert and frame; an alert saved before it has no
picture, and its card says "No picture was kept for this alert.". If an upgrade cannot finish,
the database stays unchanged, the page says so, and a reload tries again. Versions 5 and 6 were never
released and upgrade the same way.

If a history read fails, the alerts on screen stay and the next read retries. A failed
save keeps the alert on screen and in History's offline export and is retried at the
next history read; an acknowledgement updates it, and dismiss and clear drop it.
Repeats whose saves fail wait together, and the retry adds each of them to the saved
count; a repeat that goes on a fresh card whose own save waits counts from that save.
When their retry finds the card acknowledged in another tab, they go on one fresh
card together: the first as the card, the rest as its repeats.
When Clear all itself fails, the alerts and acknowledgements queued before it are kept:
they are written, or wait for their retry. A repeat made after this tab's Clear all
goes on a card of its own. An
acknowledgement or a dismissal never creates a record: when the alert is no longer
saved, because another tab cleared or dismissed it or a limit removed it, nothing is
written, and an acknowledged alert leaves that tab's list. Clear all data on this
device, a sign-out or Clear all, in any tab of this browser, cancels every tab's pending saves.
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
notice is shown, signing out and Clear all data on this device are refused until the reload,
after which everything saved is shown as it was. Otherwise signing out, in any tab, and
Clear all data on this device clear every local store for the whole browser. The notice is
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
