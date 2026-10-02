import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'yaml-path',
    title: 'YAML Path Tester',
    description: 'Query a YAML document with a JSONPath or JMESPath expression.',
    category: 'data',
    keywords: ['yaml', 'jsonpath', 'jmespath', 'query', 'path', 'filter'],
    route: '/tools/yaml-path',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested generated scalar YAML with JSONPath root queries for stable result shape.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'yamlInput', extensions: ['.yaml', '.yml'] },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'file'], produces: ['json'] }
};
