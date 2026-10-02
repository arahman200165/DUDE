import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'env-validator',
    title: '.env Validator',
    description: 'Validates a .env file against a required-keys list with lightweight number/boolean/url type hints.',
    category: 'developer',
    keywords: ['env', 'dotenv', 'validate', 'environment variables'],
    route: '/tools/env-validator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary environment and rule text for non-throwing validation results.',
    },
    persistence: { input: 'session', preferences: 'local' },
    fileInput: { key: 'envText', extensions: ['.env'] },
    io: { accepts: ['text', 'file'], produces: ['text'] }
};
