import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'port-process-lookup',
  title: 'Port → Process Lookup',
  description:
    'Find which process owns a port: a live, filterable table of every TCP and UDP socket joined to its owning process. Type 3000 to see who is using :3000, open the owner in Process Viewer, or end it through a previewed, confirmed change.',
  category: 'developer',
  keywords: ['port', 'pid', 'process', 'listening', 'netstat', 'who is using port', '3000', 'socket', 'tcp', 'udp', 'LISTEN', 'kill port', 'port in use', 'address already in use'],
  route: '/tools/port-process-lookup',
  load: () => import('./port-process-lookup').then((m) => m.PortProcessLookupTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads the TCP and UDP socket tables and running processes through the desktop system helper' },
    { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'ends the process that owns a port through the desktop system mutation engine' },
  ],
  consequenceClass: ['process-management'],
  io: { accepts: ['text'], produces: ['json'] },
};
