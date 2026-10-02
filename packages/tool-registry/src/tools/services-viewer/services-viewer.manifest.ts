import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'services-viewer',
    title: 'Services Viewer',
    description: 'Windows services with live state, startup type, account and binary path, plus dependency and dependent trees (copyable as Mermaid). Start, stop, restart or change the startup type of a service through a previewed, confirmed change that lists the dependents a stop would take down.',
    category: 'developer',
    keywords: ['services', 'service', 'SCM', 'start', 'stop', 'restart', 'dependencies', 'dependents', 'startup type', 'driver', 'automatic', 'manual', 'disabled', 'windows', 'service control manager'],
    route: '/tools/services-viewer',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    capabilities: [
        { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'lists services and reads their configuration and dependencies through the desktop system helper' },
        { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'starts, stops, restarts and reconfigures services through the desktop system mutation engine' },
    ],
    consequenceClass: ['system-config'],
    io: { accepts: ['text'], produces: ['json'] }
};
