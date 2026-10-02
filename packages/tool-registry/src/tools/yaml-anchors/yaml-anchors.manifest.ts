import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'yaml-anchors',
    title: 'YAML Anchor / Alias Visualizer',
    shortTitle: 'YAML Anchors',
    description: "Visualize a YAML document's anchors and aliases and where each one resolves.",
    category: 'data',
    keywords: ['yaml', 'anchor', 'alias', 'reference', 'merge key'],
    route: '/tools/yaml-anchors',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested generated scalar anchor and alias documents for alias discovery.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.yaml', '.yml'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'file'], produces: ['table'] }
};
