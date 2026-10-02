import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'file-lock-inspector',
    title: 'File Lock Inspector',
    description: 'Find out what is using a file or folder: lists the applications and services holding it (Windows Restart Manager, no admin needed), scans exact handles when elevated, and releases the lock through a previewed, confirmed change: a graceful Restart Manager shutdown or restart first, ending the owner process as the fallback. Handles are never force-closed.',
    category: 'developer',
    keywords: ['file lock', 'locked file', 'in use', 'file in use', 'handle', 'restart manager', 'who is using this file', 'openfiles', 'handle.exe', 'cannot delete file', 'being used by another process', 'unlocker', 'sharing violation'],
    route: '/tools/file-lock-inspector',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    capabilities: [
        { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'lists lock owners through Restart Manager and, when elevated, scans process handles through the desktop system helper' },
        { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'releases a lock through a graceful Restart Manager shutdown or restart, or ends the owner process, via the desktop system mutation engine' },
        { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'uses a native picker to grant the file or folder to inspect' },
    ],
    consequenceClass: ['process-management'],
    verification: {
        crossChecked: [
            'a pwsh process holding [IO.File]::Open(path, Open, Read, None): Restart Manager reported its PID, start time and name for both a file and its folder',
            'RmShutdown against that console holder returns ERROR_SEM_TIMEOUT within the helper budget and the holder keeps running (nothing is force-closed)',
        ],
        propertyTested: false,
        vectors: ['Sysinternals handle.exe was not on PATH and openfiles /query is disabled, so the elevated handle scan is covered by path-matching unit tests only'],
        summary: 'Restart Manager listing was verified against a real process holding a file open with no sharing; the graceful release is bounded (cancel, then abandon) and reports applications that did not respond. The handle scan needs an elevated helper and was not exercised interactively.',
    },
    io: { accepts: ['file', 'text'], produces: ['json'] }
};
