import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';

// Drift check for the generated apps/web/public/manifest.webmanifest (scripts/generate-web-manifest.mjs,
// Phase 26 Item 9), mirroring security-doc.spec.ts.
describe('manifest.webmanifest (generated)', () => {
  const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'apps/web/public/manifest.webmanifest'), 'utf-8')) as {
    id: string;
    start_url: string;
    scope: string;
    icons: { purpose: string; src: string }[];
    shortcuts: { url: string }[];
    file_handlers: { action: string; accept: Record<string, string[]> }[];
    protocol_handlers: { protocol: string; url: string }[];
  };

  it('lists exactly the pwaShortcut tools, in order, capped at 10', () => {
    const expected = TOOL_DEFINITIONS.filter((tool) => tool.pwaShortcut)
      .sort((a, b) => a.pwaShortcut!.order - b.pwaShortcut!.order || a.id.localeCompare(b.id))
      .map((tool) => `.${tool.route}`);
    expect(expected.length).toBeLessThanOrEqual(10);
    expect(manifest.shortcuts.map((shortcut) => shortcut.url), 'stale -- run npm run generate:registry').toEqual(expected);
  });

  it('handles exactly the file types tools claim via desktopOpen (same source as the desktop installer)', () => {
    const expected = [...new Set(TOOL_DEFINITIONS.flatMap((tool) => tool.desktopOpen?.extensions ?? []))].sort();
    expect(manifest.file_handlers.flatMap((handler) => Object.values(handler.accept).flat()).sort()).toEqual(expected);
  });

  it('keeps every URL relative so it resolves under the /DUDE/ base path, and separates any/maskable icons', () => {
    for (const url of [manifest.id, manifest.start_url, manifest.scope, ...manifest.shortcuts.map((s) => s.url), ...manifest.protocol_handlers.map((p) => p.url)]) {
      expect(url.startsWith('./'), url).toBe(true);
    }
    expect(manifest.icons.every((icon) => icon.purpose === 'any' || icon.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(manifest.protocol_handlers).toEqual([{ protocol: 'web+dude', url: './open-link?u=%s' }]);
  });
});
