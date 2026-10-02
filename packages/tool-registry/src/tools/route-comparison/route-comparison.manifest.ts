import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'route-comparison',
    title: 'Route Comparison',
    description: 'Compare two network traces or before and after traces.',
    category: 'developer',
    keywords: ['network', 'route', 'comparison'],
    route: '/tools/route-comparison',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    network: { required: true, detail: 'hop-limited ICMP probes to the one or two hosts you enter' },
    capabilities: [{ kind: 'platform', id: 'native-network', web: 'unavailable', note: 'runs live checks through the Windows desktop network bridge' }],
    io: { accepts: ['text'], produces: ['json'] }
};
