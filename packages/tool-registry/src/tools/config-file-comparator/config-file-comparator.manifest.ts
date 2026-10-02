import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'config-file-comparator',
    title: 'Config File Comparator',
    description: 'Diffs two config files as .env, INI, or Java .properties, reporting added, removed, and changed keys.',
    category: 'developer',
    keywords: ['config', 'diff', 'compare', 'env', 'ini', 'properties'],
    route: '/tools/config-file-comparator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzzed arbitrary before/after text across env, INI, and properties parsing; asserted tagged results without throws.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
