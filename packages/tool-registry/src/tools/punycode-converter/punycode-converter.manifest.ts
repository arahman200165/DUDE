import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'punycode-converter',
    title: 'Punycode Converter',
    description: 'Converts an internationalized domain name between Unicode and its Punycode (ASCII, "xn--") form, and inspects it for mixed-script homograph risk.',
    category: 'web',
    keywords: [
        'punycode',
        'idn',
        'domain',
        'unicode',
        'ascii',
        'xn--',
        'internationalized',
        'homograph',
        'mixed-script',
    ],
    route: '/tools/punycode-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested (fast-check) for full IDNA domains. RFC 3492 §7.1 examples omit the xn-- ACE prefix and therefore are not exact vectors for this domain-level API.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text', 'url'], produces: ['text', 'url'] }
};
