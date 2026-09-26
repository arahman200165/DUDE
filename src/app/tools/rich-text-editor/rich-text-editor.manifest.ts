import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'rich-text-editor',
  title: 'Rich Text Editor',
  shortTitle: 'Rich Text',
  description: 'WYSIWYG editor with sanitized HTML and Markdown export.',
  category: 'documents',
  keywords: [
    'wysiwyg',
    'rich text',
    'editor',
    'html',
    'markdown',
    'tiptap',
    'formatting',
    'word processor',
  ],
  route: '/tools/rich-text-editor',
  load: () => import('./rich-text-editor').then((m) => m.RichTextEditor),
  status: 'experimental',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text', 'file'] },
};
