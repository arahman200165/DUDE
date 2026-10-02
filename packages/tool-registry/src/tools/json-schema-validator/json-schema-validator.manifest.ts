import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'json-schema-validator',
    title: 'JSON Schema Validator',
    shortTitle: 'Schema Validator',
    description: 'Validate a JSON instance against a Draft-07 or 2020-12 JSON Schema, with per-error paths.',
    category: 'data',
    keywords: [
        'json schema',
        'validate',
        'draft-07',
        '2020-12',
        'ajv',
        'schema',
        'instance',
        'validation',
    ],
    route: '/tools/json-schema-validator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check using fuzz checks against arbitrary valid or malformed input.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'instance', extensions: ['.json'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'json', 'file'], produces: ['json'] }
};
