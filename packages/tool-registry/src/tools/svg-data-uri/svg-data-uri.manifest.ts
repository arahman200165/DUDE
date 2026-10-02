import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'svg-data-uri',
    title: 'SVG ↔ Data URI',
    description: 'Converts SVG markup to a data:image/svg+xml URI (URL-encoded or base64) and back.',
    category: 'encoding',
    keywords: ['svg', 'data uri', 'base64', 'encode', 'decode', 'css background'],
    route: '/tools/svg-data-uri',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip and fuzz-tested (fast-check) against arbitrary text -- caught and fixed a real bug where decoding blanket-trimmed the whole input, silently stripping leading/trailing whitespace that was actually part of the SVG payload in the URL-encoded form.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'svgInput', extensions: ['.svg'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
