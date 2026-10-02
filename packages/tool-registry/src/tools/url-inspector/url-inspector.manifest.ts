import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'url-inspector',
    title: 'URL / URI Inspector',
    description: 'Break a URL down into scheme, host, path, query, and fragment — edit any part, and see a colorized component breakdown.',
    category: 'web',
    keywords: [
        'url',
        'uri',
        'inspector',
        'parse',
        'scheme',
        'host',
        'query',
        'fragment',
        'visualizer',
        'breakdown',
    ],
    route: '/tools/url-inspector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested (fast-check): buildUrl/parseUrl recover a structurally-safe UrlParts domain, and segmentUri always reconstructs the exact original string; plus neverThrows fuzzing on arbitrary text.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text', 'url'], produces: ['json', 'url'] }
};
