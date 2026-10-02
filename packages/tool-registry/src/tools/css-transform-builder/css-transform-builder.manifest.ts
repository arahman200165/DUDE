import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'css-transform-builder',
    title: 'CSS Transform Builder',
    description: 'Builds a CSS transform declaration from translate, rotate, scale, and skew controls, with a live preview.',
    category: 'developer',
    keywords: [
        'css transform',
        'translate',
        'rotate',
        'scale',
        'skew',
        'transform-origin',
        'css generator',
    ],
    route: '/tools/css-transform-builder',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator-tested (fast-check): finite transform states produce valid values and matching declarations.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
