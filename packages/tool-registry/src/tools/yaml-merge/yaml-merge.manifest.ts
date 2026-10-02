import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'yaml-merge',
    title: 'YAML Merge',
    description: 'Deep-merge two YAML documents into one.',
    category: 'data',
    keywords: ['yaml', 'merge', 'combine', 'deep merge'],
    route: '/tools/yaml-merge',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested generated scalar YAML values against empty overlays, preserving values.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'baseInput', extensions: ['.yaml', '.yml'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
