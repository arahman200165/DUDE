import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'oidc-discovery-inspector',
    title: 'OpenID Connect Discovery Document Inspector',
    shortTitle: 'OIDC Discovery',
    description: 'Inspects a pasted OIDC discovery document (.well-known/openid-configuration) — validates required fields and summarizes capabilities.',
    category: 'security',
    keywords: [
        'oidc',
        'openid connect',
        'discovery',
        'well-known',
        'openid-configuration',
        'issuer',
        'endpoints',
    ],
    route: '/tools/oidc-discovery-inspector',
    status: 'verified',
    verification: {
        vectors: ['OIDC Discovery 1.0 required/recommended metadata fields'],
        propertyTested: true,
        summary: 'Checks against the official OIDC Discovery 1.0 field list and is fuzz-tested with arbitrary text/JSON (fast-check) -- never throws.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text', 'json'], produces: ['json'] }
};
