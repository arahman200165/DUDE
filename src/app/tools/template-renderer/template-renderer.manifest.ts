import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'template-renderer',
  title: 'Template Renderer',
  shortTitle: 'Templates',
  description:
    'Render an EJS template against a JSON data context in a network-isolated sandbox, using the same execution engine as the JavaScript Playground.',
  category: 'developer',
  keywords: ['template', 'ejs', 'render', 'interpolation', 'sandbox'],
  route: '/tools/template-renderer',
  load: () => import('./template-renderer').then((m) => m.TemplateRenderer),
  status: 'experimental',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'required' },
  network: { required: false },
  io: { accepts: ['text', 'json'], produces: ['text'] },
};
