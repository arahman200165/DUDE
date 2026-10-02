import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'kubeconfig-inspector',
    title: 'kubeconfig Inspector',
    description: "Summarizes a kubeconfig's clusters, contexts, and users, redacting credential fields (tokens, client certs/keys, passwords) behind a reveal toggle.",
    category: 'developer',
    keywords: ['kubernetes', 'k8s', 'kubeconfig', 'inspect', 'cluster', 'context'],
    route: '/tools/kubeconfig-inspector',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested with arbitrary text (fast-check) -- never throws on malformed YAML.',
    },
    consequenceClass: ['authentication'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['json'] }
};
