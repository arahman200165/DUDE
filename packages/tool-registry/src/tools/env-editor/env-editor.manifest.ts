import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'env-editor',
    title: '.env Editor',
    description: 'Edits a .env file as a key/value list or raw text, with quoting handled automatically.',
    category: 'developer',
    keywords: ['env', 'dotenv', 'environment variables', 'editor'],
    route: '/tools/env-editor',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip-tested unique valid keys and arbitrary values through .env serialization and parsing.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'raw', extensions: ['.env'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
