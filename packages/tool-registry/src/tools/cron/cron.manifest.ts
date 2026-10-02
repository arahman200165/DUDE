import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'cron',
    title: 'Cron Expression Parser',
    shortTitle: 'Cron Parser',
    description: 'Parse a cron expression into a richer human-readable schedule and preview its next or previous run times.',
    category: 'date-time',
    keywords: ['cron', 'crontab', 'schedule', 'next run', 'previous run', 'expression'],
    route: '/tools/cron',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check) against arbitrary text and well-formed-but-arbitrary cron expressions, asserting strictly-ordered next/previous runs around a fixed `now`.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
