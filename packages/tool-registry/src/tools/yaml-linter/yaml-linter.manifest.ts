import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'yaml-linter',
    title: 'YAML Linter',
    description: 'Validate YAML and surface parse errors with line and column detail.',
    category: 'data',
    keywords: ['yaml', 'lint', 'validate', 'syntax', 'error'],
    route: '/tools/yaml-linter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary strings for non-throwing structured YAML lint results.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.yaml', '.yml'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'file'], produces: ['text'] }
};
