import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'css-specificity-calculator',
  title: 'CSS Specificity Calculator / Comparer',
  shortTitle: 'CSS Specificity',
  description:
    'Scores one or more CSS selectors by specificity and ranks them from most to least specific.',
  category: 'developer',
  keywords: ['css', 'specificity', 'selector', 'cascade', 'compare selectors'],
  route: '/tools/css-specificity-calculator',
  load: () => import('./css-specificity-calculator').then((m) => m.CssSpecificityCalculator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
