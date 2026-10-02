import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'directory-diff',
    desktopOpen: { directory: true },
    capabilities: [
        { kind: 'platform', id: 'native-fs', web: 'fallback', note: 'compares real folders on disk, not zipped/pasted file lists' },
        { kind: 'platform', id: 'file-watch', web: 'unavailable', note: 'optionally rescans open folders when their contents change' },
    ],
    title: 'Directory Diff',
    description: 'Compare two folders for added/removed/changed files, with a line diff for text files and a hex byte diff for binary files.',
    category: 'text',
    keywords: ['directory', 'folder', 'diff', 'compare', 'binary diff', 'hex', 'files'],
    route: '/tools/directory-diff',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) against the pure diffDirectoryPayload core: never throws/rejects for arbitrary file lists, and diffing a payload against an identical copy of itself reports every entry as unchanged.',
    },
    persistence: { input: 'none', preferences: 'local' },
    execution: { worker: 'required' },
    io: { accepts: ['file'], produces: ['json'] }
};
