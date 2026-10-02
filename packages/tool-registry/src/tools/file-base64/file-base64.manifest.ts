import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'file-base64',
    title: 'File Base64 Converter',
    shortTitle: 'File Base64',
    description: 'Convert a local file to Base64 text, or a Base64 string back into a downloadable file, with MIME sniffing and an image preview.',
    category: 'encoding',
    keywords: [
        'base64',
        'file',
        'encode',
        'decode',
        'download',
        'binary',
        'convert',
        'attachment',
        'mime',
        'image preview',
    ],
    route: '/tools/file-base64',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip property-tested (fast-check) for arbitrary binary input through encodeFileToBase64/decodeBase64ToBytes; sniffFileType fuzz-tested and checked to recognize the PNG signature for arbitrary trailing bytes.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'optional' },
    io: { accepts: ['file', 'text'], produces: ['text', 'file'] }
};
