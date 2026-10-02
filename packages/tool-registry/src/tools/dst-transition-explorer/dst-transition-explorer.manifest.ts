import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'dst-transition-explorer',
    title: 'DST Transition Explorer',
    description: 'List every daylight-saving-time transition for a timezone in a chosen year, with the exact offset change and gap.',
    category: 'date-time',
    keywords: [
        'dst',
        'daylight saving',
        'timezone',
        'transition',
        'spring forward',
        'fall back',
        'utc offset',
    ],
    route: '/tools/dst-transition-explorer',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): neverThrows on arbitrary zone/year input, plus an invariant that every listed transition row has a real offset change and rows are date-ordered.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['table', 'json'] }
};
