/** @jest-environment node */
/**
 * The Lost and Found example's photos and their record
 *
 * Three photos of the sample clip's kitten are committed under public/home/
 * lost-found/ for a Lost and Found example: one photo from Wikimedia Commons
 * and two stills from the part of the same recording that the clip leaves
 * out. Their record, photos.json, names each file's size and digest, where it
 * came from, its crop box and its licence, and lists every set of media the
 * Pictures workflow's probe tried with whether the watch alerted. These tests
 * fail when a file differs from its record, when the record lacks a source, a
 * licence or a crop, and when the last set tried did not alert.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import clip from '../public/home/sample-clip.json';
import { pictureSize } from './helpers/picture-size';

const PUBLIC = path.resolve(__dirname, '..', 'public');
const file = (relative: string) => path.join(PUBLIC, relative);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

interface PictureFile {
  file: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
}

interface PhotoEntry extends PictureFile {
  alt: string;
  crop: { x: number; y: number; width: number; height: number };
  copy600: PictureFile;
  source: {
    title: string;
    page: string;
    file: string;
    sha1: string;
    bytes: number;
    width: number;
    height: number;
    author: string;
    date: string;
    atSeconds?: number;
  };
}

interface PhotosRecord {
  photos: PhotoEntry[];
  licence: { name: string; shortName: string; address: string; legalCode: string; readOn: string; quoted: string };
  credit: string;
  command: string[];
  notChecked: string[];
  tried: { set: string; run: string; alerted: boolean; saved: number; alertLine: number; firstAlertSeconds: number | null; best: unknown }[];
}

const photos: PhotosRecord = JSON.parse(fs.readFileSync(file('home/lost-found/photos.json'), 'utf8'));

describe('the Lost and Found example photos and their record', () => {
  it.each([1, 2, 3])('photo %i is committed at 1200 by 900 with a 600 by 450 copy, each the file its record names', (n) => {
    const entry = photos.photos[n - 1];
    for (const [relative, width, height, record] of [
      [`home/lost-found/photo-${n}.jpg`, 1200, 900, entry],
      [`home/lost-found/photo-${n}-600.jpg`, 600, 450, entry.copy600],
    ] as const) {
      const bytes = fs.readFileSync(file(relative));
      expect(record.file).toBe(relative);
      expect({ width: record.width, height: record.height }).toEqual({ width, height });
      expect(pictureSize(bytes)).toEqual({ width, height });
      expect(bytes.length).toBe(record.bytes);
      expect(sha256(bytes)).toBe(record.sha256);
    }
  });

  it('photo 1 is the Commons photo and photos 2 and 3 are stills from the part of the recording the clip leaves out', () => {
    const [one, two, three] = photos.photos;
    expect(one.source.page).toBe('https://commons.wikimedia.org/wiki/File:Female_Champagne_Burmese_Kitten.jpg');
    expect(one.source.sha1).toBe('3d388f535f6370097e7ba76f9548ca34cfd2ef8a');
    expect(one.source).toMatchObject({ width: 3784, height: 2428, bytes: 2692928 });
    for (const still of [two, three]) {
      expect(still.source.page).toBe('https://commons.wikimedia.org/wiki/File:Burmese_Kitten_Grooming_Itself.webm');
      expect(still.source.sha1).toBe(clip.sources[0].original.sha1);
      expect(still.source).toMatchObject({ width: 3840, height: 2160 });
    }
    expect([two.source.atSeconds, three.source.atSeconds]).toEqual([3, 13]);
    // The clip is 17.0 to 45.2 s of the recording; a still from inside it would compare the clip with itself.
    expect(three.source.atSeconds).toBeLessThan(17);
  });

  it('each photo names its author, its licence with its address and the day it was read, its crop box and what it shows', () => {
    const alts = [
      'Photo 1 of 3: a kitten lying on a beige carpet, facing the camera',
      'Photo 2 of 3: a kitten sitting on a grey carpet, licking a paw',
      'Photo 3 of 3: a kitten sitting on a grey carpet, seen from behind',
    ];
    photos.photos.forEach((photo, i) => {
      expect(photo.source.author).toBe('Alistair Findlay');
      expect(photo.source.file).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//);
      expect(photo.alt).toBe(alts[i]);
      const { x, y, width, height } = photo.crop;
      for (const value of [x, y, width, height]) expect(Number.isInteger(value)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(Math.abs(width * 3 - height * 4)).toBeLessThanOrEqual(3);
      expect(width).toBeGreaterThanOrEqual(1200);
      expect(x + width).toBeLessThanOrEqual(photo.source.width);
      expect(y + height).toBeLessThanOrEqual(photo.source.height);
    });
    expect(photos.licence).toMatchObject({ shortName: 'CC0 1.0', address: 'https://creativecommons.org/publicdomain/zero/1.0/' });
    expect(photos.licence.readOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(photos.licence.quoted.length).toBeGreaterThan(100);
    expect(photos.credit).toBe('Photos: Alistair Findlay (Psypherium), CC0 1.0, cropped; two are stills from the recording the clip comes from.');
    expect(photos.command.join('\n')).toContain('photo-3-600.jpg');
    expect(photos.notChecked.join(' ')).toContain('same kitten');
  });

  it('each photo was cut with the crop box its record states, from the source and moment it names', () => {
    photos.photos.forEach((photo, i) => {
      const n = i + 1;
      const { x, y, width, height } = photo.crop;
      for (const cut of [photo, photo.copy600]) {
        const name = path.basename(cut.file);
        const lines = photos.command.filter((line) => line.endsWith(` ${name}`));
        expect(lines).toHaveLength(1);
        const [line] = lines;
        expect(line).toContain(`crop=${width}:${height}:${x}:${y},scale=${cut.width}:${cut.height}:`);
        expect(line).toContain(`-i ${decodeURIComponent(path.basename(photo.source.file))}`);
        if (photo.source.atSeconds === undefined) expect(line).not.toContain(' -ss ');
        else expect(line).toContain(` -ss ${photo.source.atSeconds.toFixed(1)} `);
      }
      expect(photo.file).toBe(`home/lost-found/photo-${n}.jpg`);
    });
  });

  it('lists every set of media tried, and the last one alerted', () => {
    expect(photos.tried.length).toBeGreaterThanOrEqual(1);
    for (const attempt of photos.tried) {
      expect(attempt.run).toMatch(/^https:\/\/github\.com\/framerslab\/safeos\/actions\/runs\/\d+$/);
      expect(typeof attempt.alerted).toBe('boolean');
      expect(attempt.alertLine).toBe(70);
    }
    expect(photos.tried[photos.tried.length - 1].alerted).toBe(true);
  });
});
