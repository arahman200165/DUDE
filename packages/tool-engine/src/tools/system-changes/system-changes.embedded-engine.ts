import type { SysApplyResult, SysJournalEntry, SysOpOutcome, SysPlanPreview, SysSnapshotHeader } from "@dude/contracts/system/sys-mutation-types";
export function SystemChangesTool_when(iso: string): string { return iso.slice(0, 16).replace('T', ' '); }
export function SystemChangesTool_glyph(outcome: SysOpOutcome): 'success' | 'warning' | 'error' | 'cancelled' {
    return outcome === 'applied' ? 'success' : outcome === 'failed' ? 'error' : outcome === 'cancelled' ? 'cancelled' : 'warning';
}
