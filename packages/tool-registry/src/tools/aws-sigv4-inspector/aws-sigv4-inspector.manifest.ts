import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'aws-sigv4-inspector',
    title: 'AWS Signature V4 Inspector',
    shortTitle: 'SigV4 Inspector',
    description: 'Recomputes and verifies an AWS Signature Version 4 signed request, or builds one from scratch.',
    category: 'web',
    keywords: [
        'aws',
        'sigv4',
        'signature version 4',
        'authorization header',
        'canonical request',
        'hmac-sha256',
        'sts',
        's3',
        'access key',
    ],
    route: '/tools/aws-sigv4-inspector',
    status: 'verified',
    verification: {
        vectors: ["AWS's official SigV4 worked example (GET https://iam.amazonaws.com/, AKIDEXAMPLE)"],
        summary: "Signature computation matches AWS's own documented worked example exactly, cross-checked independently via Node's crypto.",
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
