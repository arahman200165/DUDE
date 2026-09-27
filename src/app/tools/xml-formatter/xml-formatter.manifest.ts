import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'xml-formatter',
  desktopOpen: { extensions: ['.xml'], inputKey: 'input' },
  title: 'XML Formatter',
  description: 'Validate, format, and minify XML.',
  category: 'data',
  keywords: ['xml', 'format', 'validate', 'pretty', 'minify'],
  route: '/tools/xml-formatter',
  load: () => import('./xml-formatter').then((m) => m.XmlFormatter),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested generated XML text through formatting and validation.',
  },
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'file'], produces: ['text', 'file'] },
};
