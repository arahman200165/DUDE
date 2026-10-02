// Generates apps/web/public/manifest.webmanifest (DUDE_PRD.md §21 Phase 26 Item 9) from tool manifests, so
// installed-PWA metadata can't drift from the registry:
// - `shortcuts`: tools opting in with `pwaShortcut: { order }`, in ascending order.
// - `file_handlers`: every extension a tool claims through `desktopOpen.extensions`, the same
//   source as the desktop installer's file associations (scripts/generate-file-associations.mjs),
//   so web "Open with DUDE" and desktop Explorer "Open with" cover the same types. Launched files
//   are consumed by core/pwa/pwa-launch.service.ts.
// - `protocol_handlers`: web+dude:// → /open-link (core/deep-link/open-link.guard.ts), the web
//   twin of desktop dude:// links.
//
// All URLs are relative, so the file resolves under GitHub Pages' /DUDE/ base path.
//
// Usage: node scripts/generate-web-manifest.mjs (chained into `npm run generate:registry`)

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifests } from './tool-manifests.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_DIR = path.join(ROOT, 'apps/web/src/app/tools');
const MANIFEST_PATH = path.join(ROOT, 'apps/web/public/manifest.webmanifest');
const MAX_SHORTCUTS = 10;

function findManifests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findManifests(full);
    return entry.name.endsWith('.manifest.ts') ? [full] : [];
  });
}

const field = (text, name) => text.match(new RegExp(`\\n  ${name}:\\s*'((?:[^'\\\\]|\\\\.)*)'`))?.[1]?.replace(/\\(.)/g, '$1');

const tools = readManifests().map(({metadata}) => ({
  ...metadata, shortcutOrder: metadata.pwaShortcut?.order ?? NaN,
  extensions: metadata.desktopOpen?.extensions ?? [],
}));

const shortcuts = tools
  .filter((tool) => Number.isFinite(tool.shortcutOrder))
  .sort((a, b) => a.shortcutOrder - b.shortcutOrder || a.id.localeCompare(b.id));
if (shortcuts.length > MAX_SHORTCUTS) {
  throw new Error(`${shortcuts.length} tools declare pwaShortcut; browsers show only a few, so the cap is ${MAX_SHORTCUTS}.`);
}

const extensions = [...new Set(tools.flatMap((tool) => tool.extensions))].sort();
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

const manifest = {
  id: './',
  name: 'DUDE — Developer Utility Dashboard Engine',
  short_name: 'DUDE',
  description:
    'The zero-install web companion to Desktop DUDE: a dense deck of local developer utilities that runs in your browser and keeps working offline.',
  categories: ['developer', 'productivity', 'utilities'],
  theme_color: '#0a0e14',
  background_color: '#0a0e14',
  display: 'standalone',
  scope: './',
  start_url: './',
  launch_handler: { client_mode: ['focus-existing', 'auto'] },
  icons: [
    ...sizes.map((size) => ({ src: `icons/icon-${size}x${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
    { src: 'icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
  ],
  screenshots: [
    { src: 'screenshots/deck-wide.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'The DUDE tool deck' },
  ],
  shortcuts: shortcuts.map((tool) => ({
    name: tool.title,
    short_name: tool.shortTitle ?? tool.title,
    description: tool.description,
    url: `.${tool.route}`,
    icons: [{ src: 'icons/icon-96x96.png', sizes: '96x96', type: 'image/png' }],
  })),
  file_handlers: extensions.length ? [{ action: './', accept: { 'text/plain': extensions } }] : [],
  protocol_handlers: [{ protocol: 'web+dude', url: './open-link?u=%s' }],
};

const content = `${JSON.stringify(manifest, null, 2)}\n`;
let previous = '';
try {
  previous = readFileSync(MANIFEST_PATH, 'utf8').replace(/\r\n/g, '\n');
} catch {
  // First run.
}
if (previous === content) {
  console.log(`manifest.webmanifest already up to date (${shortcuts.length} shortcuts, ${extensions.length} file types).`);
} else {
  writeFileSync(MANIFEST_PATH, content, 'utf8');
  console.log(`Regenerated manifest.webmanifest: ${shortcuts.length} shortcuts, ${extensions.length} file types.`);
}
