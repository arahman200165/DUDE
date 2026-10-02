import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'week-number-calculator',
    title: 'Week Number Calculator',
    description: 'Convert a date to its ISO-8601 week number and back, and see how many weeks a given week-year has.',
    category: 'date-time',
    keywords: ['week number', 'iso week', 'calendar week', 'iso 8601', 'week year', 'weekday'],
    route: '/tools/week-number-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): dateToWeek/weekToDate round-trip recovers the original date for arbitrary dates, plus neverThrows on arbitrary input.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['json'] }
};
