import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ct-lookup',
    title: 'Certificate Transparency Lookup',
    shortTitle: 'CT Lookup',
    description: 'Decode a certificate\'s embedded SCTs and name each CT log from a bundled list, and search a domain\'s certificate history on crt.sh.',
    category: 'security',
    keywords: ['certificate transparency', 'ct', 'sct', 'crt.sh', 'log', 'precertificate', 'monitoring', 'certificate history'],
    route: '/tools/ct-lookup',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'crt.sh (or a crt.sh-compatible endpoint you enter) for domain history; SCT decoding is local' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
