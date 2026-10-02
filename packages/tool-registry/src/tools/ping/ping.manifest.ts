import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'ping',
    title: 'Ping',
    description: 'Send ICMP echo requests and show round-trip latency.',
    category: 'developer',
    keywords: ['network', 'ping'],
    route: '/tools/ping',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'ICMP echo requests to the host you enter' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
