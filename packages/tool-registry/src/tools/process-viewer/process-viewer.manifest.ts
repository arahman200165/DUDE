import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'process-viewer',
    title: 'Process Viewer',
    description: 'Task manager for Windows: live CPU and memory, a parent/child process tree, and per-process command line, environment (with diffs and snapshots), modules with versions and signers, threads, handles and ports. End, restart, suspend, reprioritise or dump a process through a previewed, confirmed change.',
    category: 'developer',
    keywords: ['process', 'task manager', 'cpu', 'memory', 'threads', 'modules', 'dll', 'handles', 'open files', 'ports', 'process tree', 'parent process', 'command line', 'environment', 'pid', 'windows', 'kill', 'end task', 'terminate', 'restart', 'suspend', 'resume', 'priority', 'affinity', 'crash dump', 'minidump'],
    route: '/tools/process-viewer',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    capabilities: [
        { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads running processes and their details through the desktop system helper' },
        { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'ends, restarts, suspends, reprioritises and dumps processes through the desktop system mutation engine' },
        { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'grants the folder a crash dump is written into' },
    ],
    consequenceClass: ['process-management'],
    io: { accepts: ['text'], produces: ['json'] }
};
