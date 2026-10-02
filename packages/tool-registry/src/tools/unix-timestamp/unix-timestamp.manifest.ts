import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'unix-timestamp',
    title: 'Unix Timestamp Converter',
    description: 'Convert between Unix timestamps (seconds through nanoseconds), ISO 8601, HTTP-date, RFC 2822, and human-readable dates.',
    category: 'date-time',
    keywords: [
        'unix',
        'timestamp',
        'epoch',
        'date',
        'time',
        'utc',
        'convert',
        'microseconds',
        'nanoseconds',
        'iso 8601',
        'rfc 2822',
        'http-date',
        'rfc 7231',
        'imf-fixdate',
    ],
    route: '/tools/unix-timestamp',
    pwaShortcut: { order: 7 },
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip-tested (fast-check): converting to seconds/milliseconds and parsing back recovers the original value; plus neverThrows on arbitrary input across all units.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
