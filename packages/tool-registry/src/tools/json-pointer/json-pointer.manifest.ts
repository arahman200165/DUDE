import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'json-pointer',
    title: 'JSON Pointer Tester',
    description: 'Resolve an RFC 6901 JSON Pointer against a JSON document.',
    category: 'data',
    keywords: ['json pointer', 'rfc 6901', 'resolve', 'path', 'query'],
    route: '/tools/json-pointer',
    status: 'verified',
    verification: {
        vectors: ['RFC 6901 section 5 JSON Pointer examples, including the empty pointer, empty key, and escaped tokens'],
        propertyTested: true,
        summary: 'RFC 6901 section 5 vectors plus fast-check fuzzing of valid and malformed pointers.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'jsonInput', extensions: ['.json'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'json', 'file'], produces: ['json', 'file'] }
};
