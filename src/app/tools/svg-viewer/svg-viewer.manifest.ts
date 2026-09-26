import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'svg-viewer',
  title: 'SVG Viewer / Formatter / Optimizer',
  description: 'Previews SVG markup and formats, minifies, or optimizes it (via SVGO).',
  category: 'documents',
  keywords: ['svg', 'format', 'minify', 'optimize', 'svgo', 'vector'],
  route: '/tools/svg-viewer',
  load: () => import('./svg-viewer').then((m) => m.SvgViewer),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary:
      'Fuzz-tested (fast-check) the pure formatSvg/minifySvg/optimizeSvg core against arbitrary strings, truncated valid SVG, and XML-flavored noise: never throws and always returns a well-shaped ok/error result.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text', 'file'], produces: ['text'] },
};
