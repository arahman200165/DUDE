import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'dom-tree-viewer',
  title: 'DOM Tree Viewer',
  description:
    'Parses HTML and renders it as a collapsible DOM tree — elements, attributes, text nodes, and comments.',
  category: 'developer',
  keywords: ['dom', 'html tree', 'dom viewer', 'html structure', 'element tree'],
  route: '/tools/dom-tree-viewer',
  load: () => import('./dom-tree-viewer').then((m) => m.DomTreeViewer),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
