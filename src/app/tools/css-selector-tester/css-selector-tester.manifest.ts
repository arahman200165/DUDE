import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'css-selector-tester',
  title: 'CSS Selector Tester',
  description:
    'Tests a CSS selector against sample HTML and lists every matched element in document order.',
  category: 'developer',
  keywords: ['css', 'selector', 'querySelectorAll', 'test selector', 'css selector tester'],
  route: '/tools/css-selector-tester',
  load: () => import('./css-selector-tester').then((m) => m.CssSelectorTester),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'DOM-backed properties verify generated selector match counts, document order, and typed results for arbitrary HTML and selectors.',
  },
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
