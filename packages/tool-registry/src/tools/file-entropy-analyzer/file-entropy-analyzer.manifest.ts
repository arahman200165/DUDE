import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'file-entropy-analyzer',
    title: 'File Entropy Analyzer',
    description: "Computes an uploaded file's Shannon byte-distribution entropy overall and in sliding windows, to spot packed, encrypted, or compressed regions.",
    category: 'developer',
    keywords: [
        'entropy',
        'shannon entropy',
        'randomness',
        'compressed',
        'encrypted',
        'packed',
        'forensics',
    ],
    route: '/tools/file-entropy-analyzer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary bytes for input-size preservation and entropy bounds.',
    },
    persistence: { input: 'none', preferences: 'none' },
    execution: { worker: 'optional' },
    io: { accepts: ['file'], produces: ['json'] }
};
