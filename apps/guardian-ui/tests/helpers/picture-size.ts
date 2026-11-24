/** The width and height of a PNG, WebP or JPEG file, read from its own bytes. */
export function pictureSize(bytes: Buffer): { width: number; height: number } {
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

/**
 * Whether a JPEG file is whole: its segments lead to the start of the scan,
 * the scan's header is all there, and the file ends with the end-of-image
 * marker after it. A file cut short
 * after its size is read fails.
 */
export function jpegIsWhole(bytes: Buffer): boolean {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (marker === 0xda) {
      // The whole scan header, then at least the end-of-image marker.
      const end = bytes.length;
      const scanFrom = at + 2 + bytes.readUInt16BE(at + 2);
      return scanFrom + 2 <= end && bytes[end - 2] === 0xff && bytes[end - 1] === 0xd9;
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return false;
}
