import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'oauth-scope-parser',
    title: 'OAuth Scope Parser',
    shortTitle: 'Scope Parser',
    description: 'Splits an OAuth/OIDC space-delimited scope string into individual scopes with known-scope annotations.',
    category: 'security',
    keywords: ['oauth', 'scope', 'scopes', 'openid', 'permissions', 'space delimited', 'oidc'],
    route: '/tools/oauth-scope-parser',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'parseScopeString/buildScopeString round-trip and never-throws are checked with generated inputs (fast-check), not just hand-picked examples.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
