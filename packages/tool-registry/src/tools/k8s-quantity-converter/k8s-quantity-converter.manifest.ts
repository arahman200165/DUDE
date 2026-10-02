import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'k8s-quantity-converter',
    title: 'Kubernetes Quantity Converter',
    shortTitle: 'K8s Quantity Converter',
    description: 'Converts a Kubernetes resource quantity (e.g. "500m", "1Gi") to its canonical value and every other common unit at once.',
    category: 'developer',
    keywords: ['kubernetes', 'k8s', 'quantity', 'resource', 'convert', 'cpu', 'memory'],
    route: '/tools/k8s-quantity-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested supported quantities within formatter precision and fuzz-tested arbitrary quantity strings with fast-check.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['table'] }
};
