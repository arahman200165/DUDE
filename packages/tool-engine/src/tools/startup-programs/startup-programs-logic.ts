import type { StartupEntry } from "@dude/contracts/system/startup-types";
import type { SysPlanRequest } from "@dude/contracts/system/sys-mutation-types";

export type StartupFilter = 'all' | 'registry-run' | 'startup-folder' | 'scheduled-task' | 'service';

export function filterStartupEntries(entries: readonly StartupEntry[], query: string, source: StartupFilter, state: string): readonly StartupEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    if (source !== 'all' && entry.source !== source) return false;
    if (state !== 'all' && entry.state !== state) return false;
    if (!needle) return true;
    return [entry.name, entry.command, entry.targetPath, entry.publisher, entry.source, entry.scope, entry.state, entry.detail]
      .some((value) => value?.toLocaleLowerCase().includes(needle));
  });
}

export function startupToggleRequest(entry: StartupEntry): SysPlanRequest | null {
  const approved = entry.approved;
  if (!approved || (entry.state !== 'enabled' && entry.state !== 'disabled')) return null;
  const enabled = entry.state !== 'enabled';
  return {
    tool: 'startup-programs',
    title: `${enabled ? 'Enable' : 'Disable'} startup entry: ${entry.name}`,
    ops: [{ kind: enabled ? 'startup.enable' : 'startup.disable', params: {
      hive: approved.hive,
      path: approved.path,
      view: approved.view,
      valueName: approved.valueName,
      exists: approved.exists,
      ...(approved.bytes ? { bytes: approved.bytes } : {}),
      enabled,
    } }],
  };
}
