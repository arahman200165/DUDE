import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'csp-builder',
    title: 'CSP Builder',
    description: 'Builds or parses a Content-Security-Policy header directive by directive, flagging weakening combinations like unsafe-inline or a wildcard source.',
    category: 'web',
    keywords: ['csp', 'content-security-policy', 'header', 'security', 'xss', 'directive'],
    route: '/tools/csp-builder',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): parse/build never throw on arbitrary input, whitespace/semicolon-free directives round-trip exactly, and warnings stay bounded per directive.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
