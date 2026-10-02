import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'xml-formatter',
    desktopOpen: { extensions: ['.xml'], inputKey: 'input' },
    title: 'XML Formatter',
    description: 'Validate, format, and minify XML.',
    category: 'data',
    keywords: ['xml', 'format', 'validate', 'pretty', 'minify'],
    route: '/tools/xml-formatter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested generated XML text through formatting and validation.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'optional' },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
