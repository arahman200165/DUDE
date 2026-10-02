import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'cubic-bezier-editor',
    title: 'Cubic-Bezier Editor',
    description: 'Interactive cubic-bezier() easing curve editor with draggable control points and a live animated preview.',
    category: 'developer',
    keywords: [
        'cubic-bezier',
        'easing',
        'timing-function',
        'css animation',
        'transition-timing-function',
    ],
    route: '/tools/cubic-bezier-editor',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): x-coordinate validation follows the unit interval and generated values do not throw.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
