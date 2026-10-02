import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'hash-manifest',
    title: 'Hash Manifest & Snapshot',
    shortTitle: 'Hash Manifest',
    description: 'Bulk-hash a folder into sha256sum / BSD-tag / JSON / CSV manifests with a Merkle directory hash, verify manifests, and snapshot folders to diff later or against a live rescan.',
    category: 'security',
    keywords: ['checksum', 'sha256sum', 'md5sum', 'manifest', 'directory hash', 'merkle', 'verify', 'integrity', 'snapshot', 'folder diff', 'bulk hash', 'shasum'],
    route: '/tools/hash-manifest',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    capabilities: [
        { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'streams and hashes whole folders in the desktop fs worker' },
    ],
    io: { accepts: ['file', 'text'], produces: ['text', 'json', 'table', 'file'] }
};
