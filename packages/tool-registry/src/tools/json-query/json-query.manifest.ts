import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'json-query',
    title: 'JSONPath / JMESPath Tester',
    description: 'Query JSON with a JSONPath or JMESPath expression.',
    category: 'data',
    keywords: ['jsonpath', 'jmespath', 'query', 'json', 'filter', 'search'],
    route: '/tools/json-query',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested with fast-check using fuzz checks against arbitrary valid or malformed input.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'jsonInput', extensions: ['.json'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'json', 'file'], produces: ['json', 'file'] }
};
