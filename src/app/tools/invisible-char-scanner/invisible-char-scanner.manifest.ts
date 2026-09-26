import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'invisible-char-scanner',
  title: 'Invisible / Control / Zero-Width Character Scanner',
  shortTitle: 'Invisible Char Scanner',
  description:
    'Scans text for invisible, control, and zero-width characters, lists each occurrence, and strips selected kinds.',
  category: 'text',
  keywords: ['invisible', 'zero-width', 'control character', 'c0', 'c1', 'scan', 'hidden', 'strip'],
  route: '/tools/invisible-char-scanner',
  load: () => import('./invisible-char-scanner').then((m) => m.InvisibleCharScanner),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested (fast-check): scanInvisibleChars/stripInvisibleChars never throw, and stripping every kind leaves no invisible characters for scanInvisibleChars to find.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['json'] },
};
