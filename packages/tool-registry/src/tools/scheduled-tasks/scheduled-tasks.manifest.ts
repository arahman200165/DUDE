import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'scheduled-tasks',
    title: 'Scheduled Tasks',
    description: 'Inspect Windows scheduled tasks, triggers, actions, principals and run results. Enable or disable a task through a previewed system change.',
    category: 'developer',
    keywords: ['scheduled tasks', 'task scheduler', 'triggers', 'last run', 'next run', 'enable task', 'disable task', 'schtasks', 'Windows'],
    route: '/tools/scheduled-tasks',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    capabilities: [
        { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads scheduled tasks through a fixed PowerShell 7 script in the desktop app' },
        { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'enables or disables tasks through the desktop system mutation engine' },
    ],
    consequenceClass: ['system-config'],
    io: { accepts: ['text'], produces: ['json'] }
};
