import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'jwt-claims-analyzer',
    title: 'JWT Claims Analyzer',
    shortTitle: 'Claims Analyzer',
    description: 'Decodes a JWT and flags claim-level issues — missing/expired timestamps, risky algorithms, non-standard claims.',
    category: 'security',
    keywords: [
        'jwt',
        'claims',
        'analyze',
        'lint',
        'security',
        'exp',
        'iat',
        'nbf',
        'aud',
        'iss',
        'alg none',
    ],
    route: '/tools/jwt-claims-analyzer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with arbitrary JSON-shaped header/payload (fast-check) -- caught and fixed a real crash on non-object header/payload input.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
