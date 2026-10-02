import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'toml-formatter',
    desktopOpen: { extensions: ['.toml'], inputKey: 'input' },
    title: 'TOML Formatter / Validator',
    description: 'Validate and reformat TOML.',
    category: 'data',
    keywords: ['toml', 'format', 'validate', 'config'],
    route: '/tools/toml-formatter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested generated basic integer assignments through TOML formatting and validation.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
