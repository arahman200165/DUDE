import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'css-formatter',
  desktopOpen: { extensions: ['.css'], inputKey: 'input' },
  title: 'CSS Formatter / Minifier',
  description:
    'Pretty-prints or minifies CSS, comment- and string-aware, including nested at-rules like @media.',
  category: 'developer',
  keywords: ['css', 'formatter', 'minifier', 'pretty print', 'beautify', 'css minify'],
  route: '/tools/css-formatter',
  load: () => import('./css-formatter').then((m) => m.CssFormatter),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
