# Setup, Help and dashboard words that say what is true

The after pictures come from Pictures run 46098054937 on commit 81dc247700a08b2ae4b901a74d43f8f4d8b4498f: the setup pictures from its job Walk setup, the others from its job Capture pictures. The before pictures come from Pictures run 46083140872 on commit af20e43, which holds master's code (29d28f4) with this change's new tests and captures: the setup pictures from its job Walk setup, the others from its job Capture pictures. Master's own capture list had none of the first two states.

- `before/setup-camera-unread-390-light.png`: Setup's first step after a refusal in a browser whose permission query for the camera fails, 390 px, light, before: it says the camera is blocked.
- `after/setup-camera-unread-390-light.png`: The same, after: the camera did not open; press Try again, then Allow, or allow it in the site's settings if the browser does not ask; with Try again and How to allow the camera.
- `before/setup-camera-unread-390-dark.png`: The same state, 390 px, dark, before.
- `after/setup-camera-unread-390-dark.png`: The same state, 390 px, dark, after.
- `before/dashboard-lost-pet-camera-blocked-390-light.png`: The dashboard with A lost pet chosen, no pet saved and the camera blocked, 390 px, light, before: the blocked camera's sentence and How to allow the camera above a key that opens Lost and Found.
- `after/dashboard-lost-pet-camera-blocked-390-light.png`: The same, after: no camera sentence and no How to allow the camera.
- `before/dashboard-lost-pet-camera-blocked-390-dark.png`: The same state, 390 px, dark, before.
- `after/dashboard-lost-pet-camera-blocked-390-dark.png`: The same state, 390 px, dark, after.
- `before/help-1280-light.png`: Help's Getting Started, 1280 px, light, before: "Press Open dashboard, then Start watching."
- `after/help-1280-light.png`: The same, after: step 3 names every last key setup can show and the key that starts the watch on each page.
- `before/help-1280-dark.png`: Help's Getting Started, 1280 px, dark, before.
- `after/help-1280-dark.png`: Help's Getting Started, 1280 px, dark, after.
- `before/help-390-light.png`: Help's Getting Started, 390 px, light, before.
- `after/help-390-light.png`: Help's Getting Started, 390 px, light, after.
- `before/help-390-dark.png`: Help's Getting Started, 390 px, dark, before.
- `after/help-390-dark.png`: Help's Getting Started, 390 px, dark, after.

Focus on step 2's heading once the camera opens from a key shows no ring in a capture (the heading takes focus with no outline, as on a change of step), so no picture shows it; the walk reads the focused element instead.
