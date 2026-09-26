import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'dpi-calculator',
  title: 'DPI Calculator',
  description:
    'Converts between pixel dimensions, physical print size, and DPI -- find the DPI of an image at a given print size, the pixels needed for a target DPI, or the print size a given pixel count supports.',
  category: 'documents',
  keywords: ['dpi', 'ppi', 'print resolution', 'pixel density', 'print size'],
  route: '/tools/dpi-calculator',
  load: () => import('./dpi-calculator').then((m) => m.DpiCalculator),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
