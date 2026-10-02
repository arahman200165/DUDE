import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'env-diff',
    title: '.env Diff',
    description: 'Diffs two .env files, reporting added, removed, and changed variables.',
    category: 'developer',
    keywords: ['env', 'dotenv', 'diff', 'compare', 'environment variables'],
    route: '/tools/env-diff',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary .env document pairs for stable diff result shapes.',
    },
    persistence: { input: 'session', preferences: 'none' },
    fileInput: { key: 'before', extensions: ['.env'] },
    io: { accepts: ['text', 'file'], produces: ['text'] }
};
