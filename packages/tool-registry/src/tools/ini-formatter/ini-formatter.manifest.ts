import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ini-formatter',
    desktopOpen: { extensions: ['.ini'], inputKey: 'input' },
    title: 'INI Formatter / Parser',
    description: 'Convert between INI and JSON, in either direction.',
    category: 'data',
    keywords: ['ini', 'format', 'parse', 'config', 'sections'],
    route: '/tools/ini-formatter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check via the shared harness for arbitrary inputs and tool-specific invariants.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'json', 'file'], produces: ['json', 'text', 'file'] }
};
