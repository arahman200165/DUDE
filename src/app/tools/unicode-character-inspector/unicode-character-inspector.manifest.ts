import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'unicode-character-inspector',
  title: 'Unicode Character Inspector',
  description:
    'Inspect pasted text character by character: code point, UTF-8/UTF-16 bytes, general category, Unicode block, and official name.',
  category: 'text',
  keywords: [
    'unicode',
    'character',
    'inspector',
    'codepoint',
    'utf-8',
    'utf-16',
    'general category',
    'block',
    'char',
    'name',
  ],
  route: '/tools/unicode-character-inspector',
  load: () => import('./unicode-character-inspector').then((m) => m.UnicodeCharacterInspector),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): neverThrows plus code-point count/truncation-cap invariants and U+XXXX hex-formatting correctness, verified for arbitrary text.',
  },
  persistence: { input: 'session' },
  io: { accepts: ['text'], produces: ['json'] },
};
