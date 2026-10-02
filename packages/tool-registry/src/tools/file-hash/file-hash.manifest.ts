import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'file-hash',
    title: 'File Hash Generator',
    shortTitle: 'File Hash',
    description: 'MD5, SHA-1, SHA-256, SHA-384, and SHA-512 digests for a local file.',
    category: 'security',
    keywords: [
        'hash',
        'file',
        'checksum',
        'md5',
        'sha1',
        'sha256',
        'sha512',
        'digest',
        'integrity',
        'verify',
    ],
    route: '/tools/file-hash',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Crosscheck-tested (fast-check) against Node crypto\'s reference digests over arbitrary byte buffers for every shared algorithm.',
    },
    persistence: { input: 'none', preferences: 'local' },
    execution: { worker: 'required' },
    io: { accepts: ['file'], produces: ['text'] }
};
