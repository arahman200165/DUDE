import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ulid-tools',
    title: 'ULID Generator / Inspector',
    shortTitle: 'ULID Tools',
    description: 'Generates a ULID (optionally monotonic), and inspects an existing ULID to decode its embedded timestamp and randomness component.',
    category: 'developer',
    keywords: ['ulid', 'generate', 'inspect', 'identifier', 'monotonic', 'crockford', 'base32'],
    route: '/tools/ulid-tools',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator-tested (fast-check): generated ULIDs match the format and decode to a valid timestamp/randomness field.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
