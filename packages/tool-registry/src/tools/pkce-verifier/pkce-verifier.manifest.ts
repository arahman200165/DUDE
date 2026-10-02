import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'pkce-verifier',
    title: 'PKCE Verifier',
    shortTitle: 'PKCE Verifier',
    description: 'Checks whether a code_verifier matches a given code_challenge (round-trip validation).',
    category: 'security',
    keywords: ['pkce', 'code verifier', 'code challenge', 'verify', 'oauth', 's256', 'rfc 7636'],
    route: '/tools/pkce-verifier',
    status: 'verified',
    verification: {
        vectors: ["RFC 7636 Appendix B worked example"],
        summary: 'Verifier/challenge matching is checked against RFC 7636 Appendix B\'s official worked example.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
