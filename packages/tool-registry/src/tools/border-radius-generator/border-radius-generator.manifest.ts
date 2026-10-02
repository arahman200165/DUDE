import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'border-radius-generator',
    title: 'Border Radius Generator',
    description: 'Builds a CSS border-radius declaration from linked or independent corner values, with a live preview.',
    category: 'developer',
    keywords: ['border-radius', 'css rounded corners', 'css generator'],
    route: '/tools/border-radius-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator-tested (fast-check): CSS radius values use valid units and declarations match their value.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
