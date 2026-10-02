import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'encoding-detector',
    title: 'Encoding Detector',
    description: "Guesses an uploaded file's text encoding from its byte-order mark, or from a UTF-8/ASCII validity check when there is none, with a confidence rating.",
    category: 'developer',
    keywords: ['encoding', 'utf-8', 'utf-16', 'bom', 'byte order mark', 'charset', 'detect encoding'],
    route: '/tools/encoding-detector',
    status: 'verified',
    verification: { propertyTested: true, summary: 'Property-tested detectEncoding over arbitrary byte arrays and all five supported BOM signatures.' },
    persistence: { input: 'none', preferences: 'none' },
    io: { accepts: ['file'], produces: ['json'] }
};
