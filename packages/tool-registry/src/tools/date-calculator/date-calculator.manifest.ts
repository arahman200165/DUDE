import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'date-calculator',
    title: 'Date Calculator',
    description: 'Add/subtract calendar or business days from a date, and count days/weekdays/business-days between two dates.',
    category: 'date-time',
    keywords: [
        'date',
        'calculator',
        'business days',
        'weekdays',
        'holidays',
        'add days',
        'days between',
    ],
    route: '/tools/date-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): neverThrows on arbitrary input, plus invariants that addDays/daysBetween agree on elapsed calendar days and that weekday/weekend/business-day counts partition correctly.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
