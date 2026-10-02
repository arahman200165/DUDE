import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'recurrence-rule',
    title: 'Recurrence Rule Calculator',
    description: 'Expand an iCal-style RRULE recurrence into a list of occurrence dates — event recurrence, distinct from cron trigger schedules.',
    category: 'date-time',
    keywords: ['rrule', 'recurrence', 'recurring', 'ical', 'calendar', 'schedule', 'occurrence'],
    route: '/tools/recurrence-rule',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): neverThrows on arbitrary input, plus an invariant that a daily rule yields min(COUNT, maxOccurrences, 500) chronologically-increasing occurrences.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
