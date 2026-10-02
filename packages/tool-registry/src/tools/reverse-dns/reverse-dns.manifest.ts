import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'reverse-dns',
    title: 'Reverse DNS Lookup',
    description: 'Resolve an IP address to PTR records.',
    category: 'developer',
    keywords: ['network', 'reverse', 'dns'],
    route: '/tools/reverse-dns',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'PTR query to the system resolver, or a DNS, DoH, or DoT server you choose' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
