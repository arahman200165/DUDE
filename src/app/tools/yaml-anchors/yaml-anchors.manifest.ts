import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'yaml-anchors',
  title: 'YAML Anchor / Alias Visualizer',
  shortTitle: 'YAML Anchors',
  description: "Visualize a YAML document's anchors and aliases and where each one resolves.",
  category: 'data',
  keywords: ['yaml', 'anchor', 'alias', 'reference', 'merge key'],
  route: '/tools/yaml-anchors',
  load: () => import('./yaml-anchors').then((m) => m.YamlAnchors),
  status: 'verified',
  verification: {
    propertyTested: true,
    summary: 'Fuzz-tested generated scalar anchor and alias documents for alias discovery.',
  },
  persistence: { input: 'session', preferences: 'local' },
  fileInput: { key: 'input', extensions: ['.yaml', '.yml'] },
  execution: { worker: 'optional' },
  io: { accepts: ['text', 'file'], produces: ['table'] },
};
