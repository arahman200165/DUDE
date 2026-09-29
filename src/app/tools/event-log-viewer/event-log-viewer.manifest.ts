import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'event-log-viewer',
  title: 'Event Log Viewer',
  description:
    'Read any Windows event log channel or an opened .evtx file: build a filter (level, provider, event ID, time, text) that generates the XPath, or edit the XPath directly; save queries, import and export Event Viewer custom views, correlate by ActivityID, and follow new events with incremental polling.',
  category: 'developer',
  keywords: ['event log', 'windows event', 'evtx', 'event viewer', 'wevtutil', 'xpath', 'system log', 'application log', 'security log', 'event id', 'correlation', 'custom view'],
  route: '/tools/event-log-viewer',
  load: () => import('./event-log-viewer').then((m) => m.EventLogViewerTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads event log channels and events through the desktop system helper' },
    { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'grants the .evtx file you choose to open' },
  ],
  io: { accepts: ['text'], produces: ['json', 'file'] },
};
