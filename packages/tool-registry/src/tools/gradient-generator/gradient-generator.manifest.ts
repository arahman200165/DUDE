import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'gradient-generator',
    title: 'Gradient Generator',
    description: 'Builds a CSS linear, radial, or conic gradient from editable color stops, with a live preview.',
    category: 'encoding',
    keywords: [
        'gradient',
        'linear-gradient',
        'radial-gradient',
        'conic-gradient',
        'css gradient',
        'color stops',
    ],
    route: '/tools/gradient-generator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Property-tested (fast-check): buildGradientCss produces the expected CSS gradient shape and generateGradient is deterministic across the full type/angle/shape/stops option space.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
