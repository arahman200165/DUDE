import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'environment-variables',
    title: 'Environment Variables',
    description: 'View the user, machine and volatile Windows environment variables raw and expanded, add, edit or delete them through a previewed, confirmed change, and diff two environments (live, saved snapshot or pasted dump) with a PATH-aware breakdown.',
    category: 'developer',
    keywords: ['environment variable', 'environment variables', 'env', 'PATH', 'setx', 'user variable', 'system variable', 'machine', 'expand', '%USERPROFILE%', 'diff', 'REG_EXPAND_SZ', 'windows', 'registry'],
    route: '/tools/environment-variables',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    capabilities: [
        { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads the user, machine and volatile environment from the registry through the desktop system helper' },
        { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'adds, edits and deletes environment variables through the desktop system mutation engine' },
    ],
    consequenceClass: ['registry'],
    io: { accepts: ['text'], produces: ['json'] }
};
