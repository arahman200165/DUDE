import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'xml-xpath',
    title: 'XML XPath Tester',
    description: "Test an XPath expression against XML using the browser's native XPath engine.",
    category: 'data',
    keywords: ['xml', 'xpath', 'query', 'test', 'dom'],
    route: '/tools/xml-xpath',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested generated XML text with XPath evaluation, asserting stable result shape.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'xmlInput', extensions: ['.xml'] },
    execution: { worker: 'none' },
    io: { accepts: ['text', 'file'], produces: ['text'] }
};
