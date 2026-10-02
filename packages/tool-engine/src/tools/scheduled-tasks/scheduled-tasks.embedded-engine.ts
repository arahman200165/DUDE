
export function ScheduledTasksTool_resultHex(value: number): string { return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, '0')}`; }
export function ScheduledTasksTool_folderName(path: string): string { return path === '\\' ? 'All tasks' : path.split('\\').filter(Boolean).at(-1) ?? path; }
export function ScheduledTasksTool_message(caught: unknown): string { return caught instanceof Error ? caught.message : String(caught); }
