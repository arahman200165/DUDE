import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'k8s-resource-calculator',
    title: 'Kubernetes Resource Requests Calculator',
    shortTitle: 'K8s Resource Calculator',
    description: 'Sums container CPU/memory requests and limits across a Pod, Deployment, or other workload manifest.',
    category: 'developer',
    keywords: ['kubernetes', 'k8s', 'resources', 'requests', 'limits', 'cpu', 'memory'],
    route: '/tools/k8s-resource-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary YAML input for crash safety with fast-check.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
