import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'json-sort-keys',
    title: 'JSON Sort Keys',
    description: "Sort a JSON document's object keys alphabetically, top-level or recursively.",
    category: 'data',
    keywords: ['json', 'sort', 'keys', 'alphabetical', 'order', 'normalize'],
    route: '/tools/json-sort-keys',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check using fuzz checks against arbitrary valid or malformed input.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.json'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'json', 'file'], produces: ['json', 'file'] }
};
