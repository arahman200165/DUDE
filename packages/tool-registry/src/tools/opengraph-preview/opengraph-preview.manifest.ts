import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'opengraph-preview',
    title: 'OpenGraph Preview',
    description: 'Builds og:/twitter: meta tags and renders a live social-card preview, entirely from entered values -- no URL fetching.',
    category: 'developer',
    keywords: ['opengraph', 'og tags', 'twitter card', 'social preview', 'link preview'],
    route: '/tools/opengraph-preview',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check) for core output shape and invariants.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
