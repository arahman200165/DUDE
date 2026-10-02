import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'css-animation-builder',
    title: 'CSS Animation Builder',
    description: 'Builds an @keyframes block and its animation shorthand from an ordered list of percentage stops, with a live preview.',
    category: 'developer',
    keywords: ['css animation', 'keyframes', 'animation-timing-function', 'css generator'],
    route: '/tools/css-animation-builder',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Generator-tested (fast-check): bounded animation settings and stops produce stable keyframes and shorthand CSS.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
