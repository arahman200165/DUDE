import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'path-editor',
    title: 'PATH Editor',
    description: 'Edit the user and machine PATH with per-entry checks (missing, duplicate, unresolved, relative, quoted, not a folder), reorder and de-duplicate through a previewed, confirmed change, and see which executables shadow which (which node, git or java wins).',
    category: 'developer',
    keywords: ['path', 'PATH environment variable', 'conflict', 'shadow', 'which', 'duplicate', 'reorder', 'windowsapps', 'node version', 'path length', 'environment', 'python alias', 'windows', 'registry'],
    route: '/tools/path-editor',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    capabilities: [
        { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads the PATH from the registry and checks its directories through the desktop system helper' },
        { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'saves the user or machine PATH through the desktop system mutation engine' },
    ],
    consequenceClass: ['registry'],
    io: { accepts: ['text'], produces: ['json'] }
};
