import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'markdown',
  title: 'Markdown Preview',
  description:
    'Live side-by-side Markdown editor and sanitized HTML preview, with style presets and custom CSS.',
  category: 'documents',
  keywords: ['markdown', 'md', 'preview', 'render', 'documents', 'theme', 'style', 'custom css'],
  route: '/tools/markdown',
  load: () => import('./markdown').then((m) => m.Markdown),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary:
      'Fuzz-tested (fast-check) the pure renderMarkdown core against arbitrary text: never throws, always returns a string, and the DOMPurify pass never lets a raw <script> tag or a javascript: href through.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
