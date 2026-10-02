import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'json-patch-test',
    title: 'JSON Patch Tester',
    description: 'Apply an RFC 6902 JSON Patch to a JSON document and see the result.',
    category: 'data',
    keywords: ['json patch', 'rfc 6902', 'apply', 'test', 'patch'],
    route: '/tools/json-patch-test',
    status: 'verified',
    verification: {
        vectors: ['RFC 6902 Appendix A.1, A.2, A.14, and A.16 examples'],
        propertyTested: true,
        summary: 'Property-tested with fast-check using core-only fuzz checks against arbitrary valid or malformed input.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'documentInput', extensions: ['.json'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'json', 'file'], produces: ['json', 'file'] }
};
