import { expandEnvStrings } from '../../../shared-logic/system/env-expand';
import { normalizeDir } from '../../../shared-logic/system/path-analysis';
import {
  RUNTIME_CATALOG, classifyLocation, type Detection, type RuntimeConflict, type RuntimeId,
} from '../../../shared-logic/system/runtime-catalog';
import type { ProbeDirEntry, RegistryValue } from '../../../shared-logic/system/system-types';
import type { Finding } from '../../shared/components/findings-list/findings-list';

export const PATH_EDITOR_ROUTE = '/tools/path-editor';
/** Extensions asked of `fs.probeDirs` (only these executables are listed per directory). */
export const PROBE_EXTENSIONS: readonly string[] = ['.exe', '.cmd', '.bat', '.com'];

export interface SearchDir {
  readonly dir: string;
  /** Index in the effective PATH when the directory is on PATH. */
  readonly pathIndex?: number;
}

/** Expands `%VAR%` in catalog dirs, dropping any that still contain an unresolved reference. */
export function expandKnownDirs(env: ReadonlyMap<string, string>): string[] {
  const dirs = new Set<string>();
  for (const spec of RUNTIME_CATALOG) {
    for (const d of spec.knownDirs ?? []) {
      const e = expandEnvStrings(d, env);
      if (!/%[^%]+%/.test(e)) dirs.add(e);
    }
    for (const v of spec.homeVars ?? []) {
      const home = env.get(v.toLowerCase());
      if (home) dirs.add(`${home.replace(/\\+$/, '')}\\bin`);
    }
  }
  return [...dirs];
}

/**
 * Matches probed directory listings against the catalog. A directory on PATH yields 'path' rows (or
 * 'shim' rows when it is a WindowsApps or version-manager directory); an off-PATH directory yields
 * 'known-dir' rows. Each (runtime, file path) appears once.
 */
export function locateExecutables(dirs: readonly SearchDir[], probes: ReadonlyMap<string, ProbeDirEntry>): Detection[] {
  const out: Detection[] = [];
  const seen = new Set<string>();
  const onPathIndex = new Map<string, number>();
  for (const d of dirs) if (d.pathIndex !== undefined && !onPathIndex.has(normalizeDir(d.dir))) onPathIndex.set(normalizeDir(d.dir), d.pathIndex);

  for (const d of dirs) {
    const key = normalizeDir(d.dir);
    const probe = probes.get(key);
    if (!probe || !probe.exists || !probe.isDirectory) continue;
    const pathIndex = onPathIndex.get(key);
    const shim = classifyLocation(d.dir);
    for (const file of probe.executables) {
      const lower = file.toLowerCase();
      for (const spec of RUNTIME_CATALOG) {
        if (!spec.exeNames.includes(lower)) continue;
        const path = `${d.dir.replace(/\\+$/, '')}\\${file}`;
        const dedupeKey = `${spec.id}|${path.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push({
          id: spec.id, label: spec.label, path, exe: path,
          source: shim ? 'shim' : pathIndex !== undefined ? 'path' : 'known-dir',
          onPath: pathIndex !== undefined,
          ...(pathIndex !== undefined ? { pathIndex } : {}),
          ...(shim ? { shim } : {}),
          ...(shim === 'windowsapps' ? { note: 'App Execution Alias (may be a Store installer stub, not a real install)' } : {}),
        });
      }
    }
  }
  return out;
}

/** A registry value that names a home directory or version, as a string. */
export function registryString(values: readonly RegistryValue[], name: string): string | undefined {
  const v = values.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return v && (v.type === 'REG_SZ' || v.type === 'REG_EXPAND_SZ') && typeof v.data === 'string' && v.data ? v.data : undefined;
}

export function conflictFindings(conflicts: readonly RuntimeConflict[]): Finding[] {
  return conflicts.map((c) => ({
    id: c.id,
    status: c.severity === 'warn' ? 'warn' as const : 'info' as const,
    title: c.title,
    detail: c.detail,
    link: PATH_EDITOR_ROUTE,
    linkLabel: 'PATH Editor',
  }));
}

export interface DetectedEnvironment {
  readonly detections: readonly Detection[];
  readonly conflicts: readonly RuntimeConflict[];
  readonly javaHome?: string;
}

export function environmentJson(env: DetectedEnvironment): string {
  return JSON.stringify({
    javaHome: env.javaHome ?? null,
    runtimes: env.detections.map((d) => ({
      runtime: d.id, path: d.path, source: d.source, onPath: d.onPath, pathIndex: d.pathIndex ?? null,
      version: d.version ?? null, liveVersion: d.liveVersion ?? null, shim: d.shim ?? null,
    })),
    conflicts: env.conflicts.map((c) => ({ runtime: c.runtime, kind: c.kind, severity: c.severity, title: c.title, detail: c.detail })),
  }, null, 2);
}

const cell = (s: string | undefined): string => (s ?? '').replace(/\|/g, '\\|');

export function environmentMarkdown(env: DetectedEnvironment): string {
  const lines = ['# Developer environment', ''];
  if (env.javaHome) lines.push(`JAVA_HOME: \`${env.javaHome}\``, '');
  lines.push('| Runtime | Version | Live version | Source | On PATH | Path |', '| --- | --- | --- | --- | --- | --- |');
  for (const d of env.detections) {
    lines.push(`| ${cell(d.label)} | ${cell(d.version)} | ${cell(d.liveVersion)} | ${d.source}${d.shim ? ` (${d.shim})` : ''} | ${d.onPath ? `yes (#${(d.pathIndex ?? 0) + 1})` : 'no'} | \`${cell(d.path)}\` |`);
  }
  if (env.conflicts.length) {
    lines.push('', '## Conflicts', '');
    for (const c of env.conflicts) lines.push(`- **${c.title}**: ${c.detail}`);
  }
  return lines.join('\n') + '\n';
}

export const runtimeOrder = (id: RuntimeId): number => RUNTIME_CATALOG.findIndex((r) => r.id === id);
