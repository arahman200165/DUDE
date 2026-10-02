import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'connectivity-tester',
    title: 'TCP/HTTP Connectivity Tester',
    description: 'Test an HTTP endpoint with configurable method, headers, and body.',
    category: 'developer',
    keywords: ['network', 'connectivity', 'tester'],
    route: '/tools/connectivity-tester',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'a TCP connection or HTTP(S) request to the target you enter' },
    consequenceClass: ['remote-write'],
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json', 'file'] }
};
