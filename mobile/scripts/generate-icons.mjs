// Generates Android launcher icons + splash images from the web app's PWA icons.
// Usage (from mobile/):  node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ICONS = resolve(here, '../../public/icons');
const RES = resolve(here, '../android/app/src/main/res');
const BG = '#1E2A24';

const icon = join(ICONS, 'icon-512.png');               // rounded-square icon (transparent corners)
const maskable = join(ICONS, 'icon-maskable-512.png');  // full-bleed, content in 80% safe zone

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const out = (dir, name) => { const d = join(RES, dir); mkdirSync(d, { recursive: true }); return join(d, name); };

async function circle(src, size) {
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
  return sharp(src).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

for (const [name, k] of Object.entries(densities)) {
  const legacy = Math.round(48 * k);
  const adaptive = Math.round(108 * k);
  const dir = `mipmap-${name}`;

  // Legacy (pre-API 26) square + round icons
  await sharp(icon).resize(legacy, legacy).png().toFile(out(dir, 'ic_launcher.png'));
  await sharp(await circle(maskable, legacy)).toFile(out(dir, 'ic_launcher_round.png'));

  // Adaptive foreground: maskable art at 80% of the 108dp canvas (its own safe zone then
  // sits inside the 66dp adaptive safe zone); the rest is transparent over the bg color.
  const inner = Math.round(adaptive * 0.8);
  const pad = Math.floor((adaptive - inner) / 2);
  const art = await sharp(maskable).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: adaptive, height: adaptive, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, left: pad, top: pad }])
    .png()
    .toFile(out(dir, 'ic_launcher_foreground.png'));
}

// Splash images (legacy, pre-Android 12): brand color with the centered icon.
const splash = {
  'drawable': [480, 320],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
};
for (const [dir, [w, h]] of Object.entries(splash)) {
  const s = Math.round(Math.min(w, h) * 0.45);
  const art = await sharp(maskable).resize(s, s).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(out(dir, 'splash.png'));
}

console.log('Icons and splash images written to', RES);
