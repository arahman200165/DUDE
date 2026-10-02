import type { StartupEntry, StartupProgramsResult } from "@dude/contracts/system/startup-types";
export function StartupProgramsTool_sourceLabel(entry: StartupEntry): string {
    if (entry.source === 'registry-run')
        return (entry.detail?.includes('RunOnce') ? 'RunOnce' : 'Run') + ' · ' + (entry.id.split('|')[1]?.toUpperCase() ?? 'Registry') + ' · ' + (entry.id.split('|')[3] === '32' ? '32-bit view' : '64-bit view');
    return entry.source === 'startup-folder' ? 'Startup folder' : entry.source === 'scheduled-task' ? 'Task' : 'Service';
}
export function StartupProgramsTool_signatureLabel(entry: StartupEntry): string {
    return entry.signature === 'catalog-signed' ? 'Catalog signed' : entry.signature ?? 'Unknown';
}
