import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ascii-art-generator',
  title: 'ASCII Art Generator / Banner',
  shortTitle: 'ASCII Art',
  description: 'Renders text as an ASCII-art banner, with a choice of FIGlet fonts.',
  category: 'text',
  keywords: ['ascii art', 'banner', 'figlet', 'text art', 'font'],
  route: '/tools/ascii-art-generator',
  load: () => import('./ascii-art-generator').then((m) => m.AsciiArtGenerator),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Property-tested (fast-check) against renderAsciiArt: never throws for any curated font, is deterministic for a given text/font, and renders non-blank text as non-empty multi-line output across the whole font list.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
