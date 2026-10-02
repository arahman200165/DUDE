import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'pkce-generator',
    title: 'PKCE Generator',
    shortTitle: 'PKCE Generator',
    description: 'Generates an RFC 7636 PKCE code_verifier and its S256 (or plain) code_challenge.',
    category: 'security',
    keywords: [
        'pkce',
        'code verifier',
        'code challenge',
        'oauth',
        's256',
        'authorization code',
        'rfc 7636',
    ],
    route: '/tools/pkce-generator',
    status: 'verified',
    verification: {
        vectors: ["RFC 7636 Appendix B worked example"],
        summary: 'S256 code_challenge computation matches RFC 7636 Appendix B\'s official worked example exactly.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['json'], produces: ['text'] }
};
