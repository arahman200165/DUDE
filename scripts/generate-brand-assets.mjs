// Regenerates DUDE's raster brand assets (PWA manifest PNGs, apple-touch-icon,
// favicon.ico, og-image.png, Electron packaging icon) from the vector source
// at the repo root:
//   DUDE_logo_icon.svg -> manifest PNGs, apple-touch-icon.png, favicon.ico,
//                         og-image.png, build/icon.ico, build/icon.png
//
// Uses @playwright/test's bundled Chromium (already a devDependency, already
// installed via `npm run playwright:install`) purely as an SVG->PNG rasterizer.
// No new dependencies.
//
// Usage: node scripts/generate-brand-assets.mjs

import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const BUILD_DIR = path.join(ROOT, 'build');

const MANIFEST_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const FAVICON_SIZES = [16, 32, 48];
const APPLE_TOUCH_SIZE = 180;
// electron-builder's Windows NSIS/appx targets require an ICO with at least
// a 256x256 frame (Phase 8 Stage 8) — reuses the same buildIco() as favicon.ico.
const PACKAGING_ICO_SIZES = [16, 32, 48, 64, 128, 256];
const PACKAGING_PNG_SIZE = 512;

async function renderSvgToPng(browser, svgMarkup, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;}
    svg{display:block;}
  </style></head><body>${svgMarkup}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  const buffer = await page.screenshot({ clip: { x: 0, y: 0, width, height }, omitBackground: true });
  await page.close();
  return buffer;
}

function sizedIconSvg(iconSvgSource, size) {
  // DUDE_logo_icon.svg root tag is `width="512" height="512" viewBox="0 0 512 512"`.
  // Swap only width/height so the vector rescales cleanly at each target size;
  // viewBox stays untouched.
  return iconSvgSource.replace('width="512" height="512"', `width="${size}" height="${size}"`);
}

// Vista-style ICO: each frame is a raw PNG byte stream referenced by an
// ICONDIRENTRY. Every modern OS and browser decodes PNG-in-ICO frames directly.
function buildIco(frames) {
  const count = frames.length;
  const headerSize = 6 + 16 * count;
  const header = Buffer.alloc(headerSize);

  header.writeUInt16LE(0, 0); // reserved, must be 0
  header.writeUInt16LE(1, 2); // image type: 1 = icon
  header.writeUInt16LE(count, 4);

  let offset = headerSize;
  frames.forEach((frame, i) => {
    const entryOffset = 6 + i * 16;
    const dim = frame.size >= 256 ? 0 : frame.size; // 0 encodes 256px per ICO spec
    header.writeUInt8(dim, entryOffset + 0); // width
    header.writeUInt8(dim, entryOffset + 1); // height
    header.writeUInt8(0, entryOffset + 2); // color palette count (0 = no palette)
    header.writeUInt8(0, entryOffset + 3); // reserved
    header.writeUInt16LE(1, entryOffset + 4); // color planes
    header.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    header.writeUInt32LE(frame.buffer.length, entryOffset + 8); // resource byte size
    header.writeUInt32LE(offset, entryOffset + 12); // resource offset
    offset += frame.buffer.length;
  });

  return Buffer.concat([header, ...frames.map((f) => f.buffer)]);
}

function buildOgSvg() {
  // Full primary lockup (icon + wordmark + divider + tagline + accent bars),
  // recentered on an opaque brand-background canvas sized for OG/Twitter
  // link-preview cards (1200x630 standard, vs. the transparent 1400x360
  // lockup which doesn't match that aspect ratio).
  const scale = 0.714286; // 1000/1400 -> fits content width with side margins
  const translateX = 100;
  const translateY = (630 - 360 * scale) / 2; // vertical centering

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#07111D"/>
  <g transform="translate(${translateX} ${translateY.toFixed(3)}) scale(${scale})">
    <defs>
      <style>
        .wordmark { font-family: Inter, Geist, "SF Pro Display", "Segoe UI", Arial, sans-serif; font-size: 138px; font-weight: 800; letter-spacing: 16px; }
        .tagline { font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 28px; font-weight: 600; letter-spacing: 7px; }
      </style>
    </defs>
    <g transform="translate(44 52)">
      <path d="M20 8H102C172 8 218 50 218 128S172 248 102 248H20Z" fill="none" stroke="#F4F7FB" stroke-width="18" stroke-linejoin="round"/>
      <path d="M58 66H132" stroke="#38D8FF" stroke-width="16" stroke-linecap="round"/>
      <path d="M58 128H158" stroke="#38D8FF" stroke-width="16" stroke-linecap="round"/>
      <path d="M58 190H132" stroke="#38D8FF" stroke-width="16" stroke-linecap="round"/>
      <path d="M146 90L188 128L146 166Z" fill="#8B5CF6"/>
      <rect x="46" y="55" width="22" height="22" rx="5" fill="#38D8FF"/>
      <rect x="46" y="117" width="22" height="22" rx="5" fill="#38D8FF"/>
      <rect x="46" y="179" width="22" height="22" rx="5" fill="#38D8FF"/>
    </g>
    <text x="342" y="196" fill="#F4F7FB" class="wordmark">DUDE</text>
    <rect x="349" y="228" width="868" height="2" rx="1" fill="#26384C"/>
    <text x="349" y="286" fill="#91A4BA" class="tagline">DEVELOPER UTILITY DASHBOARD ENGINE</text>
    <rect x="1247" y="74" width="70" height="8" rx="4" fill="#38D8FF"/>
    <rect x="1247" y="96" width="46" height="8" rx="4" fill="#8B5CF6"/>
  </g>
</svg>`;
}

// Light-surface variant of the (hand-maintained) dark lockup at
// apps/web/public/brand/dude-logo-lockup.svg: the light-on-dark wordmark/tagline/icon
// outline/divider are swapped for dark-on-light equivalents, and the cyan bars
// use the darker accent so they read on a white/light panel. The purple play
// glyph reads on both surfaces and is kept.
// `node scripts/generate-brand-assets.mjs --lockup-only` writes just this file
// (no rasterizing, no other assets touched).
const LIGHT_LOCKUP_COLOR_MAP = [
  ['#F4F7FB', '#111827'], // wordmark + icon outline
  ['#91A4BA', '#475569'], // tagline
  ['#26384C', '#CBD5E1'], // divider
  ['#38D8FF', '#035E91'], // cyan bars/nodes -> darker accent
];

async function writeLightLockup() {
  const brandDir = path.join(PUBLIC_DIR, 'brand');
  let svg = await readFile(path.join(brandDir, 'dude-logo-lockup.svg'), 'utf8');
  for (const [from, to] of LIGHT_LOCKUP_COLOR_MAP) svg = svg.replaceAll(from, to);
  await writeFile(path.join(brandDir, 'dude-logo-lockup-light.svg'), svg);
  console.log('wrote brand/dude-logo-lockup-light.svg');
}

async function main() {
  await writeLightLockup();
  if (process.argv.includes('--lockup-only')) return;

  const iconSvgSource = await readFile(path.join(ROOT, 'DUDE_logo_icon.svg'), 'utf8');

  await mkdir(ICONS_DIR, { recursive: true });
  await mkdir(BUILD_DIR, { recursive: true });

  const browser = await chromium.launch();

  try {
    // 1. PWA manifest icons (paths must stay exactly as manifest.webmanifest expects)
    for (const size of MANIFEST_SIZES) {
      const svg = sizedIconSvg(iconSvgSource, size);
      const png = await renderSvgToPng(browser, svg, size, size);
      await writeFile(path.join(ICONS_DIR, `icon-${size}x${size}.png`), png);
      console.log(`wrote icons/icon-${size}x${size}.png`);
    }

    // 2. apple-touch-icon.png
    const appleSvg = sizedIconSvg(iconSvgSource, APPLE_TOUCH_SIZE);
    const applePng = await renderSvgToPng(browser, appleSvg, APPLE_TOUCH_SIZE, APPLE_TOUCH_SIZE);
    await writeFile(path.join(ICONS_DIR, 'apple-touch-icon.png'), applePng);
    console.log('wrote icons/apple-touch-icon.png');

    // 3. favicon.ico (16/32/48 multi-resolution, PNG-packed)
    const faviconFrames = [];
    for (const size of FAVICON_SIZES) {
      const svg = sizedIconSvg(iconSvgSource, size);
      const buffer = await renderSvgToPng(browser, svg, size, size);
      faviconFrames.push({ size, buffer });
    }
    await writeFile(path.join(PUBLIC_DIR, 'favicon.ico'), buildIco(faviconFrames));
    console.log('wrote favicon.ico');

    // 4. og-image.png (1200x630)
    const ogSvg = buildOgSvg();
    const ogPng = await renderSvgToPng(browser, ogSvg, 1200, 630);
    await writeFile(path.join(PUBLIC_DIR, 'og-image.png'), ogPng);
    console.log('wrote og-image.png');

    // 5. build/icon.ico + build/icon.png (electron-builder Windows packaging, Phase 8 Stage 8)
    const packagingFrames = [];
    for (const size of PACKAGING_ICO_SIZES) {
      const svg = sizedIconSvg(iconSvgSource, size);
      const buffer = await renderSvgToPng(browser, svg, size, size);
      packagingFrames.push({ size, buffer });
    }
    await writeFile(path.join(BUILD_DIR, 'icon.ico'), buildIco(packagingFrames));
    console.log('wrote build/icon.ico');

    const packagingPngSvg = sizedIconSvg(iconSvgSource, PACKAGING_PNG_SIZE);
    const packagingPng = await renderSvgToPng(browser, packagingPngSvg, PACKAGING_PNG_SIZE, PACKAGING_PNG_SIZE);
    await writeFile(path.join(BUILD_DIR, 'icon.png'), packagingPng);
    console.log('wrote build/icon.png');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
