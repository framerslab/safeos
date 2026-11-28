# SafeOS Guardian - Quick Start Guide

Get up and running with SafeOS Guardian in under 5 minutes.

## Choose Your Mode (Local-First vs Enhanced)

SafeOS Guardian is designed to work **local-first**. You can run it:

- **Local-only (offline-capable):** Uses in-browser detection (motion/audio/pixel, COCO-SSD, etc.). No backend required.
- **Enhanced local AI (optional):** Connect an Ollama server for richer vision analysis when available.

If you want the fastest start and maximum privacy/offline compatibility, you can start the UI first and add Ollama later.

## 🚀 One-Minute Setup

### 1. Install Ollama (Local AI)

*(Optional — only needed for enhanced local AI analysis.)*

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Download from https://ollama.com/download
```

### 2. Start Ollama and Pull Models

```bash
# Start Ollama server
ollama serve &

# Pull required models (one-time)
ollama pull moondream    # Fast triage (~1.7GB)
ollama pull llava:7b     # Detailed analysis (4.7 GB)
```

### 3. Start SafeOS

```bash
# From the repository root (the folder git clone made)

# Install dependencies (first time only)
npm install --legacy-peer-deps
(cd apps/guardian-ui && npm ci)

# Start everything
npm run dev
```

### 4. Open the App

Visit [http://localhost:3000](http://localhost:3000)

That's it! You're ready to monitor.

---

## 📖 Step-by-Step Tutorial

### Setting Up Your First Monitor

#### Step 1: Turn on the camera

Setup's first step says what SafeOS does on this device and that it adds an alert; it does not replace a person nearby. Press **Turn on the camera** and allow the camera and microphone when the browser asks. A camera without a microphone is enough. **Continue without the camera** goes on with the camera off; the dashboard asks for the camera when you press **Start watching**. When a request fails, the step names what happened inside the camera's frame, with **Try again**, and with **How to allow the camera** when the browser blocks it. When the browser refuses the camera and does not say whether it is blocked, the step says to press **Try again** and allow it when the browser asks, or to allow it in the site's settings if the browser does not ask. Once the camera opens from a key on step 2, the focus moves to step 2's heading.

#### Step 2: Say what it is watching

Step 2 shows the live picture with a Motion bar and a Sound bar. Wave or clap to test it. Choose **A pet**, **A baby**, **An elderly relative**, **An empty place** or **A lost pet**; the choice sets the Motion and sound setting the watch starts with. With **A baby** chosen, setup says: SafeOS is not a medical device. It does not watch breathing or any vital sign and cannot detect or prevent SIDS. Follow safe-sleep guidance. The last key reads **Open dashboard**, or **Open** and the name of the way whose row opened setup; press it, then start the watch on the page it opens: **Start watching** on the dashboard and on Motion and sound, **Start Monitoring** on Wildlife, **ARM SYSTEM** on People. **A lost pet** watches with Lost and Found: it saves the pet use, and its key, **Open Lost and Found**, opens the Lost & Found page: add the photos there and press **Start Monitoring**, then press **Start watching** on the Motion and sound page to start the camera and the comparison. Back on the dashboard, **Start watching** then uses Lost and Found for that pet; before a pet is saved, the dashboard says to add the pet's photos first, its key opens the Lost & Found page, and it says nothing of a blocked camera, since that key asks for no camera. To change the answer later, run setup again from the home page. Lost and Found is also chosen or left on Monitor, under **Watch for**, and setup shows the choice Monitor last had.

The first watch on a device asks once what an alert keeps on it ("Each alert keeps a picture"): the **Keep alert pictures** switch, on unless you turn it off, and **Delete pictures after**, 3 days unless you choose 1, 7 or 30 days or "Until I delete them". **Start watching** keeps your choice. Both settings are also under **Alert pictures** in the watch's settings and on **Settings > Detection**.

Monitor opens with one row: **Watch for** and **Mute alerts**. **Motion and sound** sounds an alert on this
device when something moves or makes a sound; **Lost and Found** also compares
what the camera sees with a saved pet's photos, by colour and shape, while the
watch runs. With Lost and Found chosen, Monitor shows the pet: **Change pet**
chooses another saved pet, and with no pet saved **Add a pet** opens the Lost &
Found page.

On Monitor, click **Start watching** inside the camera's frame. While the camera
starts the key reads "Starting the camera…", and **Cancel** under the frame cancels
the request. Once the live picture shows, a meter for each kind (Motion, Sound,
Picture change) stands under it with its alert line, and **Stop watching** releases
the camera and microphone. A camera that fails is named inside the frame with its
fix and **Try again**. A selected camera that is unavailable is named with no
**Try again**: choose another camera in the menu, or connect it again and the frame
offers **Start watching**. A browser with no camera request is named the same way;
open SafeOS in a browser that can ask for the camera. A camera that pauses its
video resumes watching when the video returns.

The **Local** processing mode sends no camera frames to a connected server. Alerts
survive reload in **History → Local Timeline** when browser storage is available.
See [Camera monitoring](MONITORING.md) for camera choice and lifecycle details.

#### Step 3: Position Your Camera

For best results:
- Place camera at eye level with the subject
- Ensure good lighting (avoid backlighting)
- Keep the entire area of interest in frame
- Stable mounting reduces false motion alerts

#### Step 4: Adjust Sensitivity

On Monitor, **Show settings** under **Settings for this watch** opens the watch's settings; there, adjust:
- **Motion Sensitivity**: Higher = more alerts on movement
- **Audio Sensitivity**: Higher = more alerts on sounds
- **Alert Volume**: How loud escalating alerts play

Settings > Detection holds Motion and Audio Sensitivity for each use (Baby Monitoring, Pet Monitoring, Elderly Care and Security). The watch for that use runs at them in place of the preset's, and **Reset to defaults** there returns the use to the preset.

On the Monitor page, the Motion and Audio sliders (Fine-Tune and Sensitivity, under **Show settings**) show and move the values set for the use while it has them, and a preset change keeps them; Fine-Tune's note names them. Fine-Tune's **Reset to** the preset's **Defaults** clears them and returns the preset's values. Pixel Threshold, Analysis Interval and the processing mode belong to the preset and are the same for every use. Analysis Interval shows only while this device's own server is connected.

---

## 🎛️ Configuration Guide

### Alert Escalation

SafeOS escalates unacknowledged alerts over time (louder + more urgent sounds).

- Configure it in **Settings → Alert Escalation**
- Each level has:
  - **Delay** (seconds after the previous level)
  - **Volume multiplier** (applied to your effective volume, including quiet-hours)
  - **Sound type**
- **Level 5** is designed to be **continuous until acknowledged**

**Acknowledge alerts** to stop escalation immediately.

### Detection Zones (Recommended)

If you want “only alert me when movement happens *here*”, use zones:

1. Go to **Settings → Zones**
2. Create one or more zones and **disable “Full Screen”** if you want zone-only evaluation
3. Optional: set per-zone overrides (motion/audio/pixel)

Zones are local-first and work offline.

### Offline Timeline & Export

SafeOS keeps a local incident log in your browser:

- Go to **History → Local Timeline** to see:
  - Monitoring alerts with their pictures (a card whose event alerted again is listed at its newest alert)
  - Lost and Found sightings with their pictures, and frames an earlier version saved
  - Security intrusion frames
  - Wildlife sightings
- History opens on Local Timeline when this device holds new alerts, and marks them as seen there.
- Add notes, filter/search (the Type filter has Wildlife), and export a local bundle:
  - **Download Bundle (.json)** (or **.json.gz** in supported browsers), with Wildlife's sightings under `wildlife.sightings`
  - Optional “incremental export” (only unexported frames and sightings)

### Notification Channels

SafeOS Guardian is local-first, so notification capabilities depend on the mode you run:

#### Browser Notifications (Free / Local)
- Works on the device running the monitor (even if the tab is in the background)
- Requires browser permission
- **Does not** wake a phone that’s not running the app/browser

Enable in **Settings → Notifications**, then test in **Settings → Test Alerts**.

#### Remote Notifications (Optional Backend)
Remote delivery (phone away from home) requires a self-hosted SafeOS API server.

- **Webhooks:** available when the backend is running (no third-party API keys required)
- **SMS / Telegram / Email:** require backend **plus** provider credentials (API keys / tokens) and may be disabled in the free static/offline deployment

---

## 💡 Tips & Best Practices

### For Pet Monitoring
- Position camera to see food/water bowls
- Include litter box area if monitoring cats
- Use "low" motion sensitivity for sleeping pets
- Turn on sound alerts: they go off when a sound stays loud, whatever made it

### For Baby Monitoring
- Camera should see the crib clearly
- Turn on sound alerts: they go off when a sound, such as crying, stays loud. A crying pattern shows in the camera overlay, but it does not raise an alert on its own
- SafeOS is not a medical device: it does not monitor breathing and cannot prevent SIDS.
- Use nightlight for low-light visibility

### For Elderly Care
- Cover common areas (living room, bathroom entrance)
- Turn on **Enable Inactivity Alerts** on **Settings > Detection** for an alert when nothing has moved for the minutes you set (for example 30)
- Turn on sound alerts: they go off when a sound stays loud, whatever made it

---

## 🔧 Troubleshooting

### "Ollama not connected"

```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# If not, start it
ollama serve
```

### "Camera not working"

1. Check browser permissions (🔒 icon in address bar)
2. Try a different browser (Chrome recommended)
3. Ensure no other app is using the camera

### "Slow analysis"

- First analysis takes longer (model loading)
- Subsequent analyses are faster
- If you enabled Ollama, verify it’s reachable and models are pulled

### "Too many false alerts"

1. Lower motion sensitivity in settings
2. Adjust audio threshold
3. Ensure stable camera mounting
4. Check for moving objects in frame (curtains, shadows)
5. Use **Calibrate Baseline** (Monitor page) to auto-suggest sensible thresholds for your room/camera

---

## 📱 Mobile Access

Access SafeOS from your phone:

1. Open the same URL on mobile browser
2. Add to home screen for app-like experience
3. Works offline with local data cache

---

## 🔐 Privacy & Data

- **In this browser:** the motion check keeps only the last three frames in memory. SafeOS keeps your settings, alerts, saved pictures, pets and recorded sounds in this browser's own storage (localStorage and IndexedDB), and records no video.
- **What leaves the device:** the host's log of your IP address, the detection model's download from Google's storage after you agree to it, a spoken alert in an online voice you choose, and camera frames sent to a server you run. The [privacy page](https://safeos.sh/privacy/) says when each happens, who sees what and how to stop it.

---

## 📞 Getting Help

- **GitHub Issues**: [Report bugs](https://github.com/framerslab/safeos/issues)
- **Email**: team@frame.dev

---

## Next Steps

1. **[API Documentation](/api/docs)** - Integrate with other systems
2. **[Advanced Configuration](./CONFIGURATION.md)** - Customize everything
3. **[Contributing](../../CONTRIBUTING.md)** - Help improve SafeOS

---

<div align="center">
  <p>
    <strong>Remember:</strong> SafeOS supplements—never replaces—human care.
  </p>
</div>


























