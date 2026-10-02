import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'oauth-playground',
    title: 'OAuth 2.0 Playground',
    shortTitle: 'OAuth Playground',
    description: 'Builds and inspects OAuth 2.0 / OIDC requests and responses for every grant type, without a live redirect flow.',
    category: 'security',
    keywords: [
        'oauth',
        'oauth2',
        'playground',
        'authorization code',
        'pkce',
        'client credentials',
        'password grant',
        'device flow',
        'implicit',
        'refresh token',
        'grant type',
        'oidc',
    ],
    route: '/tools/oauth-playground',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Callback URL/device-response/token-response inspection is fuzz-tested with arbitrary text (fast-check) -- never throws.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text', 'url'], produces: ['url', 'json'] }
};
