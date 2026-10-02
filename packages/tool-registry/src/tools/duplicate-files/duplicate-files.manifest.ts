import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'duplicate-files',
    title: 'Duplicate Files',
    shortTitle: 'Dup Files',
    description: 'Find identical files across a folder or drive (size, fingerprint, SHA-256, optional byte-compare) and text files with the same content, then recycle extras by keep-rule with a previewed plan.',
    category: 'developer',
    keywords: ['duplicate files', 'dedupe', 'deduplicate', 'identical', 'same content', 'fdupes', 'dupeguru', 'reclaim space', 'recycle bin', 'hash'],
    route: '/tools/duplicate-files',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    consequenceClass: ['filesystem-write'],
    capabilities: [
        { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'scans and hashes real folders and drives in the desktop fs worker' },
        { kind: 'platform', id: 'native-fs-write', web: 'unavailable', note: 'moves selected extra copies to the Recycle Bin through a previewed, journaled plan' },
    ],
    io: { accepts: ['file'], produces: ['table'] }
};
