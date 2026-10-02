import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'json-patch-generate',
    title: 'JSON Patch Generator',
    description: 'Diff two JSON documents into an RFC 6902 JSON Patch.',
    category: 'data',
    keywords: ['json patch', 'rfc 6902', 'diff', 'compare', 'generate'],
    route: '/tools/json-patch-generate',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check using generator output-shape checks against arbitrary valid or malformed input.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'beforeInput', extensions: ['.json'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'json', 'file'], produces: ['json', 'file'] }
};
