import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'k8s-manifest-diff',
    title: 'Kubernetes Manifest Diff',
    shortTitle: 'K8s Manifest Diff',
    description: 'Diffs two Kubernetes manifests, reporting added, removed, and changed fields.',
    category: 'developer',
    keywords: ['kubernetes', 'k8s', 'manifest', 'diff', 'compare', 'yaml'],
    route: '/tools/k8s-manifest-diff',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary YAML manifest pairs; invalid top-level scalars return a typed error.',
    },
    persistence: { input: 'session', preferences: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
