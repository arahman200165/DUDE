import type { ChangeEvent, ChangeKind, WatchedFolderStatus } from "@dude/contracts/fs/watch-types";
import { describeEvent, groupByDay, signedBytes, timelineToCsv } from "./timeline-logic.js";
import { formatBytes } from "../../shared/fs/format-size.js";
export function WatchedFoldersTool_delta(event: ChangeEvent): string { return signedBytes(event.sizeDelta, formatBytes); }
export function WatchedFoldersTool_time(iso: string): string { return new Date(iso).toLocaleTimeString(); }
export function WatchedFoldersTool_kindClass(kind: ChangeKind): string {
    return ({ created: 'text-success', modified: 'text-warning', deleted: 'text-error', renamed: 'text-accent', dude: 'text-text-muted', gap: 'text-error' } as Record<ChangeKind, string>)[kind];
}
