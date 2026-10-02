import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'env-json-converter',
    title: '.env ↔ JSON',
    description: 'Converts a .env file to a flat JSON object, or the reverse.',
    category: 'developer',
    keywords: ['env', 'dotenv', 'json', 'convert', 'environment variables'],
    route: '/tools/env-json-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip-tested valid .env pairs through JSON and fuzz-tested arbitrary text in both directions.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'input', extensions: ['.env'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'json', 'file'] }
};
