import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'html-formatter',
  title: 'HTML Formatter / Minifier',
  description:
    'Pretty-prints or minifies HTML by walking the parsed DOM, preserving <pre>/<script>/<style> content verbatim.',
  category: 'developer',
  keywords: ['html', 'formatter', 'minifier', 'pretty print', 'beautify', 'html minify'],
  route: '/tools/html-formatter',
  load: () => import('./html-formatter').then((m) => m.HtmlFormatter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'DOM-backed properties verify generated paragraph structure and text survive pretty and minified output reparsing.',
  },
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
