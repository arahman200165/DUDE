import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'k8s-manifest-validator',
    title: 'Kubernetes Manifest YAML Validator / Formatter',
    shortTitle: 'K8s Manifest Validator',
    description: 'Validates a Kubernetes manifest for required fields (apiVersion, kind, metadata.name) against a curated common-Kind list, and reformats its YAML.',
    category: 'developer',
    keywords: ['kubernetes', 'k8s', 'manifest', 'yaml', 'validate', 'format'],
    route: '/tools/k8s-manifest-validator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested parsed YAML values through formatting and fuzz-tested arbitrary YAML text with fast-check.',
    },
    persistence: { input: 'session', preferences: 'none' },
    fileInput: { key: 'input', extensions: ['.yaml', '.yml'] },
    io: { accepts: ['text', 'file'], produces: ['text', 'file'] }
};
