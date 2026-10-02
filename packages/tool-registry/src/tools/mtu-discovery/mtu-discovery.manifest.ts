import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'mtu-discovery',
    title: 'MTU Discovery',
    description: 'Probe path MTU for an explicit IPv4 or IPv6 target.',
    category: 'developer',
    keywords: ['network', 'mtu', 'discovery'],
    route: '/tools/mtu-discovery',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'sized ICMP echo probes to the host you enter' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
