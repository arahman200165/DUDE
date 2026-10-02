import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'udp-port-tester',
    title: 'UDP Port Tester',
    description: 'Probe one UDP port and show conclusive or inconclusive results.',
    category: 'developer',
    keywords: ['network', 'udp', 'port', 'tester'],
    route: '/tools/udp-port-tester',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'a UDP datagram to the host and port you enter' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
