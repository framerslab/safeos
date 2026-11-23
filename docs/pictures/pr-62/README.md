# Settings: one list that says how this device is set

Both folders come from [Pictures run 45089832789](https://github.com/framerslab/safeos/actions/runs/45089832789) of commit 3fca997ec36c19796cb9ae293deb6eae41ee957f and the base commit c59795dda9cbefa88c59e4aa777e5bf038717882: `after/` from the run's `pictures` artifact and `before/` from its `pictures-before` artifact, each file copied byte for byte under the name the run gave it.

A picture of a whole page on a phone shows the phone bar where the first screen ends, 844 px down, since the bar stays at the foot of the screen. The short mark at the left end of the footer's top line is the footer's own, before and after.

`before/`, the base commit:

- `settings-390-dark.png`: Settings before, 390 px, dark: Save Changes, the section chips and the General panel with Display Name and Theme.
- `settings-390-light.png`: Settings before, 390 px, light.
- `settings-1280-dark.png`: Settings before, 1280 px, dark: the column of section keys, the General panel and Save Changes.
- `settings-1280-light.png`: Settings before, 1280 px, light.
- `settings-sounds-390-dark.png`: Alert sounds before, 390 px, dark: no alert volume on the page; it sat in the Alerts panel of Settings, kept by Save Changes.
- `settings-sounds-390-light.png`: Alert sounds before, 390 px, light.
- `settings-sounds-1280-dark.png`: Alert sounds before, 1280 px, dark.
- `settings-sounds-1280-light.png`: Alert sounds before, 1280 px, light.

`after/`, this pull request:

- `settings-390-dark.png`: Settings, 390 px, dark: the look row and the Help row, the heading and its line, Detection, Alert sounds and Quiet hours with their small pictures, then the groups Alerts, Camera picture and This device, each row with its value.
- `settings-390-light.png`: Settings, 390 px, light.
- `settings-1280-dark.png`: Settings, 1280 px, dark: the same list in one column held to 640 px.
- `settings-1280-light.png`: Settings, 1280 px, light.
- `settings-list-390-dark.png`, `settings-list-390-light.png`, `settings-list-1280-dark.png`, `settings-list-1280-light.png`: the list once every value has been read, as the walk "settings list, values" checks it.
- `settings-list-lost-found-390-light.png`: Lost and Found chosen in setup with a saved pet: the Detection row reads "Lost and Found for Mittens, motion 80, sound 80", with the pet's photo at its left.
- `settings-list-lost-found-320-dark.png`: a long pet name with no space, "Mrwhiskersthethird", wraps inside the Detection row at 320 px.
- `settings-list-quiet-390-dark.png`: quiet hours set from 10 PM to 7 AM on every day, read at noon: "10:00 PM to 7:00 AM, every day", with the night shaded on the day's band and its moon.
- `settings-list-server-1280-light.png`: a server address saved: the group Your own server with Server address, Your name on your server, Webhooks and Admin.
- `settings-list-storage-refused-390-light.png`: a browser that refuses this site's storage: "This browser is not keeping settings. Changes last until you close this tab." at the top of the list.
- `settings-data-390-dark.png`: Data on this device, 390 px, dark: "Nothing saved on this device yet.", Export settings, and Clear all data on this device, which asks in place.
- `settings-data-390-light.png`: Data on this device, 390 px, light.
- `settings-data-1280-dark.png`: Data on this device, 1280 px, dark.
- `settings-data-1280-light.png`: Data on this device, 1280 px, light.
- `settings-sounds-390-dark.png`: Alert sounds, 390 px, dark: the Alert volume row at the top, at 100, with its Play key and "Unanswered alerts get louder from here."; the guide below it reads Pet Recall, Night Alert, Baby Monitor and Lost & Found in plain words, and the rest of the page is as before.
- `settings-sounds-390-light.png`: Alert sounds, 390 px, light.
- `settings-sounds-1280-dark.png`: Alert sounds, 1280 px, dark.
- `settings-sounds-1280-light.png`: Alert sounds, 1280 px, light.
