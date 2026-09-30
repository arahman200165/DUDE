import type { ProcessRef } from './system-types';

/**
 * Process Diagnostic Bundle (DUDE_PRD.md §21 Phase 31, Milestone 613): the section catalog, the request
 * and result shapes shared by the renderer and the main-process writer (`electron/sys-bundle.ts`), and the
 * pure size estimator behind the field/size preview. No Angular, no Node.
 */

export const BUNDLE_SECTION_IDS = ['target', 'tree', 'cmdline', 'env', 'modules', 'threads', 'handles', 'ports', 'events', 'samples', 'minidump'] as const;
export type BundleSectionId = (typeof BUNDLE_SECTION_IDS)[number];
export type BundleToggles = Readonly<Record<BundleSectionId, boolean>>;

export interface BundleSectionDef {
  readonly id: BundleSectionId;
  readonly label: string;
  /** The ZIP entry the section is written to. */
  readonly file: string;
  readonly fields: readonly string[];
}

export const BUNDLE_SECTIONS: readonly BundleSectionDef[] = [
  { id: 'target', label: 'Target summary', file: 'target.json', fields: ['pid', 'parent PID', 'name', 'session', 'started', 'image path', 'user', 'integrity', 'elevated', 'WOW64', 'priority class', 'affinity', 'CPU time', 'working set', 'private bytes', 'thread and handle counts'] },
  { id: 'tree', label: 'Process tree', file: 'tree.json', fields: ['ancestors (root to parent)', 'descendants (depth-first)', 'pid, name and start time of each'] },
  { id: 'cmdline', label: 'Command line', file: 'cmdline.txt', fields: ['command line', 'image path', 'current directory'] },
  { id: 'env', label: 'Environment', file: 'env.json', fields: ['every environment variable name and value (unredacted)'] },
  { id: 'modules', label: 'Modules', file: 'modules.json', fields: ['name', 'path', 'base address', 'size', 'file version', 'company', 'signature status and signer'] },
  { id: 'threads', label: 'Threads', file: 'threads.json', fields: ['thread id', 'state and wait reason', 'priority', 'CPU time', 'start address'] },
  { id: 'handles', label: 'Handles', file: 'handles.json', fields: ['handle value', 'type', 'name (needs an elevated DUDE)'] },
  { id: 'ports', label: 'Ports', file: 'ports.json', fields: ['TCP and UDP endpoints owned by the process', 'local and remote address', 'TCP state'] },
  { id: 'events', label: 'Related events', file: 'events.json', fields: ['Application and System events in the look-back window', 'from this PID or naming this image', 'time, level, provider, event id, message'] },
  { id: 'samples', label: 'CPU and memory samples', file: 'samples.json', fields: ['one sample per second', 'CPU percent', 'working set', 'private bytes', 'threads and handles'] },
  { id: 'minidump', label: 'Minidump', file: 'process.dmp', fields: ['thread stacks and module list (minidump), or all process memory (full-memory dump)', 'can contain secrets held in process memory'] },
];

export const BUNDLE_LIMITS = {
  eventHoursMin: 1, eventHoursMax: 168, eventHoursDefault: 24,
  sampleSecondsMin: 1, sampleSecondsMax: 120, sampleSecondsDefault: 10,
} as const;

export interface BundleOptions {
  readonly eventHours: number;
  readonly sampleSeconds: number;
  /** false = a standard minidump (stacks and modules); true = full process memory. */
  readonly fullDump: boolean;
}

export const DEFAULT_BUNDLE_OPTIONS: BundleOptions = {
  eventHours: BUNDLE_LIMITS.eventHoursDefault, sampleSeconds: BUNDLE_LIMITS.sampleSecondsDefault, fullDump: false,
};

/** Live sizes of the target, gathered cheaply by the estimate call. */
export interface BundleCounts {
  readonly treeNodes: number;
  readonly commandLineChars: number;
  readonly envBytes: number;
  readonly modules: number;
  readonly threads: number;
  readonly handles: number;
  readonly ports: number;
  readonly privateBytes: number;
  readonly workingSetBytes: number;
}

export interface BundleSectionEstimate {
  readonly id: BundleSectionId;
  readonly fields: readonly string[];
  /** Approximate uncompressed bytes the section adds to the ZIP. */
  readonly estimateBytes: number;
  /** False when the section cannot be collected right now (its `note` says why). */
  readonly available: boolean;
  readonly note?: string;
}

export interface BundleEstimate {
  readonly target: { readonly pid: number; readonly startKey: string; readonly name: string };
  readonly elevated: boolean;
  readonly counts: BundleCounts;
  readonly sections: readonly BundleSectionEstimate[];
}

export const HANDLES_NEED_ELEVATION = 'Handle names need an elevated DUDE; without elevation this section holds only a note.';

const MINIDUMP_BASE = 400 * 1024;
const MINIDUMP_PER_THREAD = 32 * 1024;

/** Approximate uncompressed size of one section. Pure, so the renderer can re-price when options change. */
export function estimateSectionBytes(id: BundleSectionId, counts: BundleCounts, options: BundleOptions, elevated: boolean): number {
  switch (id) {
    case 'target': return 2_500;
    case 'tree': return 300 * Math.max(1, counts.treeNodes) + 100;
    case 'cmdline': return counts.commandLineChars + 300;
    case 'env': return Math.round(counts.envBytes * 1.15) + 100;
    case 'modules': return 520 * counts.modules + 100;
    case 'threads': return 230 * counts.threads + 100;
    case 'handles': return elevated ? 130 * counts.handles + 100 : 200;
    case 'ports': return 190 * counts.ports + 100;
    case 'events': return 60_000;
    case 'samples': return 140 * (Math.max(1, options.sampleSeconds) + 1) + 100;
    case 'minidump': return options.fullDump ? Math.round(Math.max(counts.privateBytes, MINIDUMP_BASE) * 1.05) : MINIDUMP_BASE + MINIDUMP_PER_THREAD * counts.threads;
  }
}

export function estimateSections(counts: BundleCounts, options: BundleOptions, elevated: boolean): readonly BundleSectionEstimate[] {
  return BUNDLE_SECTIONS.map((def) => ({
    id: def.id,
    fields: def.fields,
    estimateBytes: estimateSectionBytes(def.id, counts, options, elevated),
    available: true,
    ...(def.id === 'handles' && !elevated ? { note: HANDLES_NEED_ELEVATION } : {}),
  }));
}

export function totalBytes(sections: readonly Pick<BundleSectionEstimate, 'id' | 'estimateBytes'>[], toggles: BundleToggles): number {
  return sections.reduce((sum, s) => sum + (toggles[s.id] ? s.estimateBytes : 0), 0);
}

export function allSectionsOn(): BundleToggles {
  return Object.fromEntries(BUNDLE_SECTION_IDS.map((id) => [id, true])) as Record<BundleSectionId, boolean>;
}

export interface BundleEstimateRequest extends ProcessRef { readonly options: BundleOptions }
export interface BundleWriteRequest extends ProcessRef {
  /** Renderer-chosen id for progress and cancel (8 to 64 letters, digits, `-`, `_`). */
  readonly exportId: string;
  readonly sections: BundleToggles;
  readonly options: BundleOptions;
  /** Must be the exact path returned by the native save dialog (a single-use write grant). */
  readonly savePath: string;
}

export type BundleSectionStatus = 'ok' | 'error' | 'skipped';
export interface BundleManifestSection {
  readonly id: BundleSectionId;
  readonly file: string;
  readonly status: BundleSectionStatus;
  readonly bytes: number;
  readonly note?: string;
  readonly error?: string;
}

export interface BundleManifest {
  readonly schemaVersion: 1;
  readonly tool: 'DUDE Process Diagnostic Bundle';
  readonly dudeVersion: string;
  readonly createdAt: string;
  readonly target: { readonly pid: number; readonly startKey: string; readonly name: string };
  readonly elevated: boolean;
  readonly options: BundleOptions;
  readonly sections: readonly BundleManifestSection[];
  readonly errors: readonly { readonly section: BundleSectionId; readonly message: string }[];
}

export interface BundleWriteResult {
  readonly path: string;
  readonly bytes: number;
  readonly sections: readonly BundleManifestSection[];
}

export type BundleResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string; readonly cancelled?: boolean };

export type BundlePhase = 'collecting' | 'sampling' | 'dumping' | 'writing' | 'done';
export interface BundleProgress {
  readonly exportId: string;
  readonly phase: BundlePhase;
  readonly section?: BundleSectionId;
  readonly done: number;
  readonly total: number;
  /** While sampling: how many of the one-second samples have been taken. */
  readonly sample?: { readonly done: number; readonly total: number };
}
