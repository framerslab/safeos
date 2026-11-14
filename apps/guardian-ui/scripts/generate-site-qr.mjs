// Makes the QR code the home page shows from the site's address.
//
//   node scripts/generate-site-qr.mjs [<out-file>]
//
// Runs before every build (package.json "prebuild") and before the dev
// server. The address is the site's address setting, NEXT_PUBLIC_SITE_URL,
// or https://safeos.sh when it is not set. The code is dark modules on a
// white field with a white margin in both looks, so a camera can read it. The
// file, public/home/site-qr.svg, is made at build time and is not committed.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';

const address = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://safeos.sh').replace(/\/+$/, '')}/`;
const outFile = path.resolve(process.argv[2] || 'public/home/site-qr.svg');

const svg = await QRCode.toString(address, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 4,
  color: { dark: '#000000', light: '#ffffff' },
});

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, svg.endsWith('\n') ? svg : `${svg}\n`);
console.log(`QR code for ${address} written to ${path.relative(process.cwd(), outFile)}`);
