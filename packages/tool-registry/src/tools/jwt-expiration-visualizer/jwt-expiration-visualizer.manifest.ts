import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'jwt-expiration-visualizer',
    title: 'JWT Expiration Visualizer',
    shortTitle: 'JWT Expiry',
    description: "Visualizes a JWT's iat/nbf/exp window on a timeline relative to now.",
    category: 'security',
    keywords: [
        'jwt',
        'expiration',
        'exp',
        'iat',
        'nbf',
        'timeline',
        'ttl',
        'expiry',
        'token lifetime',
    ],
    route: '/tools/jwt-expiration-visualizer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with arbitrary JSON-shaped payloads and arbitrary numeric iat/nbf/exp values (fast-check) -- never throws.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
