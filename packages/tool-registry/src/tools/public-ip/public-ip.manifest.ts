import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'public-ip',
    title: 'Public IP Detector',
    description: 'Detect public IPv4 and IPv6 addresses on explicit request.',
    category: 'developer',
    keywords: ['network', 'public', 'ip'],
    route: '/tools/public-ip',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'api.ipify.org (IPv4) and api6.ipify.org (IPv6)' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
