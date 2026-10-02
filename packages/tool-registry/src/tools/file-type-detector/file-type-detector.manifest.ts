import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'file-type-detector',
    title: 'File Signature & Type Detector',
    shortTitle: 'File Type Detector',
    description: "Identifies an uploaded file's real format from its magic bytes, disambiguates ZIP-based containers like docx/xlsx/pptx/jar, and flags a mismatch against the declared file extension.",
    category: 'developer',
    keywords: [
        'file type',
        'magic bytes',
        'signature',
        'mime',
        'detector',
        'forensics',
        'docx',
        'zip',
        'container',
    ],
    route: '/tools/file-type-detector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested byte prefixes and metadata, including file-size and matched-hex prefix bounds, with fixed-seed fast-check.',
    },
    persistence: { input: 'none', preferences: 'none' },
    io: { accepts: ['file'], produces: ['json'] }
};
