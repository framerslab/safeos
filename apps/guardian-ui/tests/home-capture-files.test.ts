/** @jest-environment node */
/**
 * The home page's pictures and the clip they are made from
 *
 * The first screen shows a capture of the monitor that the Pictures workflow
 * makes from the sample clip (scripts/home-captures.mjs). The captures, the
 * shared-link card and the two install screenshots are committed under
 * public/ from that run's artifact with their record, public/home/
 * provenance.json. These tests fail when a file is missing or differs from
 * its record, and when the clip's own record lacks its source, its author,
 * its licence or the words that describe it, so no picture ships without its
 * record. They are red on a pull request until the files from its own run are
 * committed.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import clip from '../public/home/sample-clip.json';
import captureSettings from '../scripts/home-capture-settings.json';
import { CAPTURE_CROP_NAMES, CAPTURE_FILES, CAPTURE_LOOKS, captureSizes, readProvenance } from '@/lib/home-captures';
import { useSettingsStore } from '@/stores/settings-store';

const PUBLIC = path.resolve(__dirname, '..', 'public');
const file = (relative: string) => path.join(PUBLIC, relative);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** The width and height of a PNG, WebP or JPEG file, read from its own bytes. */
function pictureSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.toString('ascii', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) break;
      const marker = bytes[at + 1];
      const length = bytes.readUInt16BE(at + 2);
      const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (startOfFrame) return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      at += 2 + length;
    }
  }
  throw new Error('not a PNG, WebP or JPEG file');
}

describe('the sample clip and its record', () => {
  it('the committed clip is the file its record names', () => {
    const bytes = fs.readFileSync(file('home/sample-clip.mp4'));
    expect(bytes.length).toBe(clip.bytes);
    expect(sha256(bytes)).toBe(clip.sha256);
    expect(clip.sha256).toBe('c0da07fcc37fb35fd843e1c7c8380ccd4342dd6a8f79eb0a5d41800f20796b5a');
  });

  it('the record names each source, its author and its licence, and the day the licence was read', () => {
    expect(clip.sources.map((source) => source.role)).toEqual(['picture', 'added sound']);
    for (const source of clip.sources) {
      expect(source.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      expect(source.author.length).toBeGreaterThan(0);
      expect(source.licence).toBe('CC0 1.0');
      expect(source.original.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(source.original.bytes).toBeGreaterThan(0);
    }
    expect(clip.licence.name).toBe('Creative Commons CC0 1.0 Universal Public Domain Dedication');
    expect(clip.licence.address).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
    expect(clip.licence.readOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clip.licence.quoted.length).toBeGreaterThan(100);
    expect(clip.command.join('\n')).toContain('sample-clip.mp4');
  });

  it('the record carries the credit line, the words that describe the clip and the text equivalent of each crop', () => {
    expect(clip.credit.long).toContain('Burmese Kitten Grooming Itself');
    expect(clip.credit.long).toContain('Alistair Findlay');
    expect(clip.credit.long).toContain('ALWA198426');
    expect(clip.credit.long).toContain('Changed:');
    expect(clip.words.description.length).toBeGreaterThan(100);
    expect(clip.words.captureCaption).toBe('SafeOS watching a recorded clip of a kitten. Captured from the app while it ran.');
    expect(Object.keys(clip.words.captureAlt).sort()).toEqual(['landscape', 'phone', 'portrait']);
    for (const text of Object.values(clip.words.captureAlt)) expect(text).toMatch(/kitten/);
    // The phone crop holds the camera view alone: its text names no meter or indicator outside it.
    expect(clip.words.captureAlt.phone).not.toMatch(/indicator|meter|reading/i);
    // The words say what the clip shows; none says SafeOS, a phone or a laptop recorded it.
    for (const text of [clip.words.caption, clip.words.description]) {
      expect(text).not.toMatch(/SafeOS|phone|laptop|recorded by/i);
    }
    // The loud sound is a separate recording, and the record says so.
    expect(clip.sounds[0].note).toContain('separate recording added to the clip');
  });

  it('the captions and descriptions tracks are WebVTT files whose cues sit inside the clip', () => {
    const cues = (name: string) => {
      const text = fs.readFileSync(file(`home/${name}`), 'utf8');
      expect(text.startsWith('WEBVTT\n')).toBe(true);
      const seconds = (stamp: string) => stamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);
      return Array.from(text.matchAll(/^(\d\d:\d\d:\d\d\.\d\d\d) --> (\d\d:\d\d:\d\d\.\d\d\d)\n(.+)$/gm)).map((cue) => ({
        start: seconds(cue[1]),
        end: seconds(cue[2]),
        words: cue[3],
      }));
    };
    const captions = cues(clip.tracks.captions);
    expect(captions).toEqual([{ start: 6, end: 9, words: '[a dog barks several times]' }]);
    expect(clip.sounds[0]).toMatchObject({ start: 6, end: 9 });
    const descriptions = cues(clip.tracks.descriptions);
    expect(descriptions).toHaveLength(5);
    for (const cue of [...captions, ...descriptions]) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
      expect(cue.end).toBeGreaterThan(cue.start);
      expect(cue.end).toBeLessThanOrEqual(clip.seconds);
    }
  });
});

describe('the capture job', () => {
  it('seeds the Custom preset: the default preset with pixel detection turned off', () => {
    expect(useSettingsStore.getState().activePresetId).toBe('maximum');
    useSettingsStore.getState().updateGlobalSettings({ pixelDetectionEnabled: false });
    const { activePresetId, globalSettings } = useSettingsStore.getState();
    expect(captureSettings).toEqual({ activePresetId, globalSettings });
    // The motion and sound lines stay the default 20, and the pixel-alert path is off.
    expect(100 - captureSettings.globalSettings.motionSensitivity).toBe(20);
    expect(100 - captureSettings.globalSettings.audioSensitivity).toBe(20);
    expect(captureSettings.globalSettings.pixelDetectionEnabled).toBe(false);
  });

  it('drives the monitor through Chromium\'s fake camera and saves after the alert list holds a motion alert', () => {
    const script = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'home-captures.mjs'), 'utf8');
    for (const part of [
      '--use-fake-device-for-media-stream',
      '--use-file-for-fake-video-capture=',
      '--use-file-for-fake-audio-capture=',
      "permissions: ['camera', 'microphone']",
      "name: 'Start watching'",
      'Motion at \\d',
      'Sound at \\d',
    ]) {
      expect(script).toContain(part);
    }
  });
});

describe('the committed captures', () => {
  const provenance = readProvenance(PUBLIC);

  it('carry a record that names the run, the commit and the clip', () => {
    expect(provenance).not.toBeNull();
    expect(provenance?.run).toMatch(/^https:\/\/github\.com\/framerslab\/safeos\/actions\/runs\/\d+$/);
    expect(provenance?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(provenance?.clip.sha256).toBe(clip.sha256);
    expect(provenance?.playwright).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(CAPTURE_FILES)('%s is committed with the width, height and bytes its record gives', (relative) => {
    expect(fs.existsSync(file(relative))).toBe(true);
    const bytes = fs.readFileSync(file(relative));
    const entry = provenance?.files.find((candidate) => candidate.path === relative);
    expect(entry).toBeDefined();
    expect(bytes.length).toBe(entry?.bytes);
    expect(sha256(bytes)).toBe(entry?.sha256);
    expect(pictureSize(bytes)).toEqual({ width: entry?.width, height: entry?.height });
    expect(entry?.viewport).toMatch(/^\d+x\d+$/);
  });

  it('are the three crops in both looks, each a .webp with a .png beside it, at the size the page gives them', () => {
    const sizes = captureSizes(PUBLIC);
    const ratios = { phone: 16 / 9, landscape: 16 / 10 };
    for (const crop of CAPTURE_CROP_NAMES) {
      for (const look of CAPTURE_LOOKS) {
        for (const extension of ['webp', 'png']) {
          expect(pictureSize(fs.readFileSync(file(`home/capture-${crop}-${look}.${extension}`)))).toEqual(sizes[crop]);
        }
      }
      const ratio = sizes[crop].width / sizes[crop].height;
      if (crop === 'portrait') {
        // The camera's frame with its live picture and the meters under it, at its own ratio.
        expect(ratio).toBeGreaterThan(0.6);
        expect(ratio).toBeLessThan(1.6);
      } else {
        expect(Math.abs(ratio - ratios[crop])).toBeLessThan(0.01);
      }
    }
  });

  it('takes the phone and portrait crops from the 390 px monitor and the landscape crop from the 1280 px monitor', () => {
    for (const entry of provenance?.files ?? []) {
      if (/capture-(phone|portrait)-/.test(entry.path)) expect(entry.viewport).toBe('390x1100');
      if (/capture-landscape-/.test(entry.path)) expect(entry.viewport).toBe('1280x1000');
    }
  });

  it('include a 1200 by 630 card under 300 KB and two 1280 by 720 install screenshots', () => {
    const card = fs.readFileSync(file('home/card.jpg'));
    expect(pictureSize(card)).toEqual({ width: 1200, height: 630 });
    expect(card.length).toBeLessThan(300_000);
    for (const name of ['dashboard', 'monitoring']) {
      expect(pictureSize(fs.readFileSync(file(`screenshots/${name}.png`)))).toEqual({ width: 1280, height: 720 });
    }
    // The web app manifest names both screenshots.
    const manifest = JSON.parse(fs.readFileSync(file('manifest.json'), 'utf8')) as { screenshots: { src: string; sizes: string }[] };
    expect(manifest.screenshots.map((shot) => `${shot.src} ${shot.sizes}`)).toEqual([
      '/screenshots/dashboard.png 1280x720',
      '/screenshots/monitoring.png 1280x720',
    ]);
  });
});
