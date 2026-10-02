import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'user-agent',
    title: 'User-Agent Parser',
    description: 'Break a User-Agent string down into browser, engine, OS, and device details.',
    category: 'web',
    keywords: ['user agent', 'ua', 'browser', 'device', 'os', 'parse'],
    route: '/tools/user-agent',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested (fast-check): parseUserAgent recovers an exact embedded version number from a Chrome-desktop and an iOS-Safari UA template, plus neverThrows fuzzing on arbitrary text.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['json'] }
};
