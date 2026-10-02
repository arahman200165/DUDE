import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'relative-time-parser',
    title: 'Relative Time Parser',
    description: 'Parses free text like "3 days ago" or "next tuesday" into a timestamp, and formats a timestamp back into relative text.',
    category: 'date-time',
    keywords: ['relative time', 'natural language', 'time ago', 'humanize', 'chrono', 'parse date'],
    route: '/tools/relative-time-parser',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip-tested (fast-check): formatRelativeTime output for a sub-minute offset re-parses via chrono-node back to the same second offset; plus neverThrows on arbitrary input.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
