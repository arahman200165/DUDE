import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'batch-text-converter',
  title: 'Batch Text Converter',
  shortTitle: 'Text Converter',
  description:
    'Inventory and convert a folder of text files: line endings (LF/CRLF), encoding (UTF-8/16, Windows-125x, Shift_JIS…), BOM, final newline, trailing whitespace and indentation — or apply .editorconfig.',
  category: 'text',
  keywords: ['line endings', 'crlf', 'lf', 'dos2unix', 'unix2dos', 'encoding', 'charset', 'iconv', 'utf-8', 'bom', 'editorconfig', 'trailing whitespace', 'tabs to spaces', 'batch convert'],
  route: '/tools/batch-text-converter',
  load: () => import('./batch-text-converter').then((m) => m.BatchTextConverterTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  consequenceClass: ['filesystem-write'],
  capabilities: [
    { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'reads real folders and re-encodes with iconv-lite in the desktop fs worker' },
    { kind: 'platform', id: 'native-fs-write', web: 'unavailable', note: 'rewrites files only through a previewed, loss-checked, undoable plan' },
  ],
  io: { accepts: ['file'], produces: ['table'] },
};
