import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'oauth-token-inspector',
    title: 'OAuth Token Inspector',
    shortTitle: 'Token Inspector',
    description: 'Inspects an OAuth access/refresh/ID token — auto-detects JWT vs opaque, decodes claims and scope, flags expiry.',
    category: 'security',
    keywords: [
        'oauth',
        'access token',
        'refresh token',
        'opaque token',
        'introspection',
        'bearer',
        'jwt',
    ],
    route: '/tools/oauth-token-inspector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with arbitrary text (fast-check) -- never throws; delegates JWT decoding to the already-verified JWT Debugger.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
