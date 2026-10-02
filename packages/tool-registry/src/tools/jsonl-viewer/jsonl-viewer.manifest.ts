import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'jsonl-viewer',
    title: 'JSON Lines / NDJSON Viewer',
    shortTitle: 'JSON Lines Viewer',
    description: 'View newline-delimited JSON (NDJSON/JSON Lines) as a table or a JSON array.',
    category: 'data',
    keywords: ['jsonl', 'ndjson', 'json lines', 'newline delimited', 'table', 'array'],
    route: '/tools/jsonl-viewer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check using fuzz checks against arbitrary valid or malformed input.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.jsonl', '.ndjson'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'json', 'file'], produces: ['table', 'json', 'file'] }
};
