import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'meta-tag-generator',
    title: 'Meta Tag Generator',
    description: 'Builds a <head> meta tag block from title/description/viewport/charset/robots/canonical fields.',
    category: 'developer',
    keywords: ['meta tags', 'seo', 'head tags', 'viewport', 'canonical', 'robots meta'],
    route: '/tools/meta-tag-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check) for core output shape and invariants.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
