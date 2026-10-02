import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ksuid-tools',
    title: 'KSUID Generator / Inspector',
    shortTitle: 'KSUID Tools',
    description: 'Generates a KSUID, and inspects an existing KSUID to decode its embedded timestamp and random payload.',
    category: 'developer',
    keywords: ['ksuid', 'generate', 'inspect', 'identifier', 'base62'],
    route: '/tools/ksuid-tools',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check) for core output shape and invariants.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
