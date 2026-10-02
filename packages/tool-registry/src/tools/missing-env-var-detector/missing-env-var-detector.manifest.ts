import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'missing-env-var-detector',
    title: 'Missing Environment Variable Detector',
    description: "Cross-checks environment variables referenced in source code against a .env file's declared keys, in both directions.",
    category: 'developer',
    keywords: ['env', 'environment variables', 'missing', 'detect', 'cross-check'],
    route: '/tools/missing-env-var-detector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check) for core output shape and invariants.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
