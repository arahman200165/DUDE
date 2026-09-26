import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'contrast-checker',
  title: 'Contrast Checker / WCAG Compliance Checker',
  shortTitle: 'Contrast Checker',
  description:
    'Computes the WCAG contrast ratio between two colors and flags AA/AAA pass/fail for text and UI components.',
  category: 'encoding',
  keywords: [
    'contrast',
    'wcag',
    'accessibility',
    'a11y',
    'contrast ratio',
    'aa',
    'aaa',
    'relative luminance',
  ],
  route: '/tools/contrast-checker',
  load: () => import('./contrast-checker').then((m) => m.ContrastChecker),
  status: 'stable',
  persistence: { input: 'session', preferences: 'none' },
  io: { accepts: ['text'], produces: ['json'] },
};
