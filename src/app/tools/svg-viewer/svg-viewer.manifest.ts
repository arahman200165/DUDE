import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'svg-viewer',
  title: 'SVG Viewer / Formatter / Optimizer',
  description: 'Previews SVG markup and formats, minifies, or optimizes it (via SVGO).',
  category: 'documents',
  keywords: ['svg', 'format', 'minify', 'optimize', 'svgo', 'vector'],
  route: '/tools/svg-viewer',
  load: () => import('./svg-viewer').then((m) => m.SvgViewer),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text', 'file'], produces: ['text'] },
};
