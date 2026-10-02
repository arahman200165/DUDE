import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'tcp-port-tester',
    title: 'TCP Port Tester',
    description: 'Test one TCP port on an explicit host.',
    category: 'developer',
    keywords: ['network', 'tcp', 'port', 'tester'],
    route: '/tools/tcp-port-tester',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'a TCP connection to the host and port you enter' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
