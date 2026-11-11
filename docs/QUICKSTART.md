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
ollama pull llava:7b     # Detailed analysis (~4GB)
```

### 3. Start SafeOS

```bash
# From monorepo root
cd safeos

# Install dependencies (first time only)
npm install

# Start everything
npm run dev
```

### 4. Open the App

Visit [http://localhost:3000](http://localhost:3000)

That's it! You're ready to monitor.

---

## 📖 Step-by-Step Tutorial

### Setting Up Your First Monitor

#### Step 1: Accept the Disclaimer

When you first open SafeOS, you'll see our critical disclaimer. Read it carefully:

> **SafeOS is NOT a replacement for human supervision.**
> This is a supplementary tool only.

Click "I Understand and Accept" to continue.

#### Step 2: Choose a Monitoring Profile

Select what you're monitoring:

| Profile | Best For | What It Watches |
|---------|----------|-----------------|
| 🐕 **Pet** | Dogs, cats, small animals | Eating, bathroom, distress, illness |
| 👶 **Baby** | Infants, toddlers | Crying, movement, breathing, safety |
| 👴 **Elderly** | Seniors, dementia patients | Falls, confusion, prolonged stillness |

#### Step 3: Allow Camera & Microphone

Click "Start Monitoring" and allow browser permissions:
- **Camera**: Required for visual monitoring
- **Microphone**: Optional but recommended for audio alerts

#### Step 4: Position Your Camera

For best results:
- Place camera at eye level with the subject
- Ensure good lighting (avoid backlighting)
- Keep the entire area of interest in frame
- Stable mounting reduces false motion alerts

#### Step 5: Adjust Sensitivity

In the sidebar, adjust:
- **Motion Sensitivity**: Higher = more alerts on movement
- **Audio Sensitivity**: Higher = more alerts on sounds
- **Alert Volume**: How loud escalating alerts play

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
  - Monitoring alerts
  - Lost & Found match frames
  - Security intrusion frames
- Add notes, filter/search, and export a local bundle:
  - **Download Bundle (.json)** (or **.json.gz** in supported browsers)
  - Optional “incremental export” (only unexported frames)

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
- Enable audio for barking/meowing detection

### For Baby Monitoring
- Camera should see the crib clearly
- Audio sensitivity is crucial for cry detection
- Enable "breathing pattern" detection
- Use nightlight for low-light visibility

### For Elderly Care
- Cover common areas (living room, bathroom entrance)
- Higher motion sensitivity for fall detection
- Set inactivity alerts (e.g., 30 min no movement)
- Include audio for distress calls

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

### What We Store
- **Local Only**: Frames are processed and discarded
- **5-10 Minute Buffer**: Rolling buffer for context
- **IndexedDB**: Session data stored in your browser
- **No Cloud Upload by Default**: Optional backend features are opt-in and self-hosted

### What We Don't Store
- Raw video footage
- Audio recordings
- Personal information
- IP addresses (for monitoring)

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


























