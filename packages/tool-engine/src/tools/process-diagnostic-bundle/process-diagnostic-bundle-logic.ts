import { hostCrypto } from "@dude/crypto/host";
import { BUNDLE_LIMITS, BUNDLE_SECTIONS, totalBytes, type BundleOptions, type BundleSectionEstimate, type BundleSectionId, type BundleToggles } from "@dude/contracts/system/bundle-types";
import type { ProcessSummary } from "@dude/contracts/system/system-types";

export { formatBytes } from "../../shared/fs/format-size.js";

const GIB = 1024 * 1024 * 1024;
const MAX_LISTED = 300;

export interface TargetRoute { readonly pid: number; readonly startKey: string | null }

/** `?pid=<n>` (and optionally `&startKey=<filetime>`) from a hand-off link; anything else is ignored. */
export function parseTargetRoute(pidText: string | null, startKeyText: string | null): TargetRoute | null {
  if (!pidText || !/^[1-9][0-9]{0,9}$/.test(pidText)) return null;
  const pid = Number(pidText);
  if (!Number.isSafeInteger(pid) || pid > 0xffffffff) return null;
  if (!startKeyText) return { pid, startKey: null };
  if (!/^[0-9]{1,20}$/.test(startKeyText)) return null;
  return { pid, startKey: startKeyText };
}

export function findTarget(processes: readonly ProcessSummary[], route: TargetRoute): ProcessSummary | null {
  return processes.find((p) => p.pid === route.pid && (route.startKey === null || p.startKey === route.startKey)) ?? null;
}

/** Name substring or PID prefix; sorted by name then PID; capped so a huge list stays cheap to render. */
export function filterProcesses(processes: readonly ProcessSummary[], query: string): { readonly rows: readonly ProcessSummary[]; readonly total: number } {
  const q = query.trim().toLowerCase();
  const matched = q ? processes.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).startsWith(q)) : [...processes];
  matched.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.pid - b.pid);
  return { rows: matched.slice(0, MAX_LISTED), total: matched.length };
}

export interface PreviewRow {
  readonly id: BundleSectionId;
  readonly label: string;
  readonly file: string;
  readonly fields: readonly string[];
  readonly estimateBytes: number;
  readonly note: string | null;
  readonly on: boolean;
}

/** One row per section: label and file from the shared catalog, the field list, priced size and whether it is on. */
export function buildPreviewRows(estimates: readonly BundleSectionEstimate[], toggles: BundleToggles): readonly PreviewRow[] {
  return BUNDLE_SECTIONS.map((def) => {
    const estimate = estimates.find((e) => e.id === def.id);
    return { id: def.id, label: def.label, file: def.file, fields: estimate?.fields ?? def.fields, estimateBytes: estimate?.estimateBytes ?? 0, note: estimate?.note ?? null, on: toggles[def.id] };
  });
}

export function selectedBytes(estimates: readonly BundleSectionEstimate[], toggles: BundleToggles): number {
  return totalBytes(estimates, toggles);
}

export function selectedCount(toggles: BundleToggles): number {
  return BUNDLE_SECTIONS.filter((def) => toggles[def.id]).length;
}

/** A plain-language warning once the export is large enough to matter (a full-memory dump can be many GiB). */
export function sizeWarning(bytes: number, includesDump: boolean, fullDump: boolean): string | null {
  if (bytes >= GIB) return 'This bundle may be several gigabytes and can take a while to write. Make sure the destination has room.';
  if (includesDump && fullDump) return 'A full-memory dump holds everything in the process memory, including secrets.';
  if (includesDump) return 'The minidump can contain data held in the process memory, including secrets.';
  return null;
}

export function clampOptions(options: BundleOptions): BundleOptions {
  const clamp = (value: number, min: number, max: number, fallback: number): number => (Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback);
  return {
    eventHours: clamp(options.eventHours, BUNDLE_LIMITS.eventHoursMin, BUNDLE_LIMITS.eventHoursMax, BUNDLE_LIMITS.eventHoursDefault),
    sampleSeconds: clamp(options.sampleSeconds, BUNDLE_LIMITS.sampleSecondsMin, BUNDLE_LIMITS.sampleSecondsMax, BUNDLE_LIMITS.sampleSecondsDefault),
    fullDump: options.fullDump === true,
  };
}

/** e.g. `node.exe-1234-20260929-153000-diagnostic-bundle.zip`. */
export function defaultBundleName(target: Pick<ProcessSummary, 'name' | 'pid'>, now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const name = target.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'process';
  return `${name}-${target.pid}-${stamp}-diagnostic-bundle.zip`;
}

export function newExportId(): string {
  const random = typeof hostCrypto() !== 'undefined' && 'randomUUID' in hostCrypto() ? hostCrypto().randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `bundle-${random}`.slice(0, 64);
}
