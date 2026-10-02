import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'hex-diff',
    title: 'Hex Diff',
    description: "Compares two uploaded files byte-by-byte in fixed-width hex rows, highlighting which 16-byte chunks differ -- the standalone version of Directory Diff's binary drill-down.",
    category: 'developer',
    keywords: ['hex diff', 'binary diff', 'byte diff', 'compare files', 'file comparison'],
    route: '/tools/hex-diff',
    status: 'verified',
    verification: { propertyTested: true, summary: 'Property-tested byte coverage, ordered 16-byte chunks, equality flags, and the text heuristic from the shared diff utility.' },
    persistence: { input: 'none', preferences: 'none' },
    io: { accepts: ['file'], produces: ['json'] }
};
