import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'xml-xpath',
  title: 'XML XPath Tester',
  description: "Test an XPath expression against XML using the browser's native XPath engine.",
  category: 'data',
  keywords: ['xml', 'xpath', 'query', 'test', 'dom'],
  route: '/tools/xml-xpath',
  load: () => import('./xml-xpath').then((m) => m.XmlXpath),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  execution: { worker: 'none' },
  io: { accepts: ['text'], produces: ['text'] },
};
