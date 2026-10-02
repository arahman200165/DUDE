import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'url-percent-inspector',
    title: 'URL Percent-Encoding Inspector',
    description: 'Breaks a URL or component down byte-by-byte, grouping percent-encoded UTF-8 sequences and flagging unencoded reserved characters.',
    category: 'web',
    keywords: [
        'url',
        'uri',
        'percent-encoding',
        'percent encode',
        'inspector',
        'byte',
        'utf-8',
        'reserved characters',
    ],
    route: '/tools/url-percent-inspector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested (fast-check): inspectPercentEncoding recovers the original string after encodeURIComponent, plus neverThrows fuzzing on arbitrary text.',
    },
    persistence: { input: 'session', preferences: 'none' },
    execution: { worker: 'none' },
    io: { accepts: ['text', 'url'], produces: ['json', 'text'] }
};
