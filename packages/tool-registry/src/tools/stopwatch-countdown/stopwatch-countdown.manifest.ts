import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'stopwatch-countdown',
    title: 'Stopwatch & Countdown',
    description: 'A start/pause/reset stopwatch, and a countdown timer that ticks down from a set duration.',
    category: 'date-time',
    keywords: ['stopwatch', 'countdown', 'timer', 'clock', 'elapsed', 'duration'],
    route: '/tools/stopwatch-countdown',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): neverThrows on arbitrary input, plus invariants that elapsed/remaining time tracks start/pause anchors correctly and never goes negative.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
