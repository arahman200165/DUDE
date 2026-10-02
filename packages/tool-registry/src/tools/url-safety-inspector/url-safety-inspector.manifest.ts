import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'url-safety-inspector',
    title: 'URL Safety Inspector',
    description: 'Heuristic URL safety checks — punycode homograph risk, userinfo tricks, IP-literal hosts, suspicious TLDs, and deep subdomain chains.',
    category: 'web',
    keywords: [
        'url',
        'safety',
        'phishing',
        'homograph',
        'punycode',
        'idn',
        'suspicious',
        'tld',
        'security',
    ],
    route: '/tools/url-safety-inspector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): inspectUrlSafety never throws on arbitrary text, and every finding it reports for a valid URL has a known id and a non-empty message.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['url'], produces: ['json'] }
};
