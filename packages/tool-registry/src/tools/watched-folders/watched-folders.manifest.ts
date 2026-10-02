import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'watched-folders',
    title: 'Watched Folders & Change Timeline',
    shortTitle: 'Watched Folders',
    description: 'Watch remembered folders in the background while DUDE runs and keep a searchable timeline of created, modified, deleted and renamed files — with notifications and optional before/after content capture.',
    category: 'developer',
    keywords: ['watch folder', 'file watcher', 'change log', 'timeline', 'audit', 'monitor folder', 'file changes', 'notifications', 'history', 'inotify', 'ReadDirectoryChanges'],
    route: '/tools/watched-folders',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    capabilities: [
        { kind: 'platform', id: 'file-watch', web: 'unavailable', note: 'watches remembered folders in the desktop main process, including while hidden to the tray' },
        { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'picks and remembers the folders to watch' },
    ],
    io: { accepts: ['file'], produces: ['table', 'json'] }
};
