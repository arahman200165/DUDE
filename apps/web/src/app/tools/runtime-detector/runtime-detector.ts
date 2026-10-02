import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { expandEnvStrings } from "@dude/tool-engine/shared/system/env-expand";
import { SYSTEM_EXPANSION_DEFAULTS, effectiveEntries, normalizeDir, parsePath, probeMap, probeTargets } from "@dude/tool-engine/shared/system/path-analysis";
import {
  buildProbePlan, dedupeByPath, findConflicts, normalizeStaticVersion, parseVersionOutput, RUNTIME_CATALOG,
  type Detection, type ProbePlanItem, type RuntimeSpec,
} from "@dude/tool-engine/shared/system/runtime-catalog";
import type { ProbeDirEntry, RegistryKeyParams } from "@dude/contracts/system/system-types";
import { PlatformService } from '../../core/platform/platform.service';
import { RuntimeProbeService } from '../../core/platform/runtime-probe.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FindingsList } from '../../shared/components/findings-list/findings-list';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { downloadFile } from '../../shared/utils/download-file';
import { PATH_ENV_KEYS, buildPathExpansionMap, findEnvValue, stringEnv, type EnvStringValue } from '../path-editor/path-editor-logic';
import {
  PATH_EDITOR_ROUTE, PROBE_EXTENSIONS, conflictFindings, environmentJson, environmentMarkdown, expandKnownDirs, locateExecutables, registryString, runtimeOrder,
  type SearchDir,
} from './runtime-detector-logic';

const columns: readonly DataTableColumn<Detection>[] = [
  { key: 'runtime', header: 'Runtime', value: (d) => d.label, sortable: true, width: '150px' },
  { key: 'version', header: 'Version', value: (d) => d.version ?? '', sortable: true, width: '110px' },
  { key: 'live', header: 'Live version', value: (d) => d.liveVersion ?? '', sortable: true, width: '110px' },
  { key: 'source', header: 'Source', value: (d) => (d.shim ? `${d.source} (${d.shim})` : d.source), sortable: true, width: '150px' },
  { key: 'path', header: 'Path', value: (d) => `${d.onPath ? `#${(d.pathIndex ?? 0) + 1} ` : ''}${d.path}${d.note ? ` - ${d.note}` : ''}`, truncate: true, width: '1fr' },
];

/**
 * Runtime Detector (DUDE_PRD.md §21 Phase 31, Milestone 600; Phase 35 items 14/15). Detection is read-only
 * (PATH, registry install keys, executable file versions). Nothing is executed on load or by inspecting a
 * result: "Run version probes" first previews the exact command lines, and only a second, deliberate click
 * calls the desktop probe that executes them.
 */
@Component({
  selector: 'app-runtime-detector',
  imports: [RouterLink, ToolShell, DesktopOnlyControl, FindingsList, StatusGlyph, DataTable],
  templateUrl: './runtime-detector.html',
})
export class RuntimeDetectorTool {
  protected readonly platform = inject(PlatformService);
  private readonly system = inject(SystemInfoService);
  private readonly probeService = inject(RuntimeProbeService);

  protected readonly columns = columns;
  protected readonly pathEditor = PATH_EDITOR_ROUTE;
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly detections = signal<readonly Detection[]>([]);
  protected readonly javaHome = signal<string | undefined>(undefined);
  protected readonly plan = signal<readonly ProbePlanItem[] | null>(null);
  protected readonly running = signal(false);
  protected readonly probeMessage = signal('');

  protected readonly sorted = computed(() => [...this.detections()].sort((a, b) => runtimeOrder(a.id) - runtimeOrder(b.id) || (a.pathIndex ?? 999) - (b.pathIndex ?? 999)));
  protected readonly conflicts = computed(() => findConflicts(this.detections(), { javaHome: this.javaHome() }));
  protected readonly findings = computed(() => conflictFindings(this.conflicts()));
  protected readonly canProbe = computed(() => buildProbePlan(this.detections()).length > 0 && !this.running());

  constructor() {
    if (this.platform.isDesktop()) void this.detect();
  }

  protected async detect(): Promise<void> {
    this.error.set('');
    this.plan.set(null);
    this.probeMessage.set('');
    this.loading.set(true);
    try {
      const envRaw: Record<'machine' | 'user' | 'volatile', readonly EnvStringValue[]> = { machine: [], user: [], volatile: [] };
      for (const s of ['machine', 'user', 'volatile'] as const) {
        try { envRaw[s] = stringEnv((await this.system.registryValues(PATH_ENV_KEYS[s])).values); } catch { /* scope unreadable: continue with what we have */ }
      }
      const env = buildPathExpansionMap(envRaw);
      this.javaHome.set(env.get('java_home'));
      const pathRaw = (s: 'machine' | 'user') => findEnvValue(envRaw[s], 'PATH') ?? '';
      const pathEntries = effectiveEntries(parsePath(pathRaw('machine'), env), parsePath(pathRaw('user'), env));
      const targets = new Set(probeTargets(pathEntries));
      const pathDirs: SearchDir[] = pathEntries.filter((e) => targets.has(e.expanded)).map((e) => ({ dir: e.expanded, pathIndex: e.index }));
      const onPath = new Set(pathDirs.map((d) => normalizeDir(d.dir)));
      const extra = expandKnownDirs(env).filter((d) => !onPath.has(normalizeDir(d)));
      const all: SearchDir[] = [...pathDirs, ...extra.map((dir) => ({ dir }))];

      let probes = new Map<string, ProbeDirEntry>();
      try {
        const dirs = [...new Set(all.map((d) => d.dir))];
        probes = probeMap((await this.system.probeDirs(dirs, [...PROBE_EXTENSIONS])).dirs);
      } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); }

      const located = locateExecutables(all, probes);
      const withVersions = await Promise.all(located.map(async (d) => {
        if (d.shim === 'windowsapps' || !/\.exe$/i.test(d.path)) return d;
        try {
          const v = await this.system.fileVersion(d.path);
          const version = normalizeStaticVersion(v.fixed?.productVersion || v.strings['ProductVersion'] || v.fixed?.fileVersion || v.strings['FileVersion']);
          return version ? { ...d, version } : d;
        } catch { return d; }
      }));

      const registry = await this.registryDetections(env);
      this.detections.set(dedupeByPath([...withVersions, ...registry]));
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : String(caught));
    } finally { this.loading.set(false); }
  }

  private async tryEnum(params: RegistryKeyParams): Promise<string[]> {
    try { return (await this.system.enumRegistryKey(params)).subkeys.map((s) => s.name); } catch { return []; }
  }

  private async tryValues(params: RegistryKeyParams) {
    try { return (await this.system.registryValues(params)).values; } catch { return []; }
  }

  /** Python PEP 514, Java JavaSoft and .NET setup keys. Read-only registry queries. */
  private async registryDetections(env: ReadonlyMap<string, string>): Promise<Detection[]> {
    const out: Detection[] = [];
    const add = (spec: RuntimeSpec, d: Omit<Detection, 'id' | 'label' | 'source' | 'onPath'>) => out.push({ id: spec.id, label: spec.label, source: 'registry', onPath: false, ...d });
    for (const spec of RUNTIME_CATALOG) {
      for (const probe of spec.registryProbes ?? []) {
        const key = { hive: probe.hive, view: probe.view };
        if (probe.kind === 'pep514') {
          for (const company of await this.tryEnum({ ...key, path: probe.path })) {
            for (const tag of await this.tryEnum({ ...key, path: `${probe.path}\\${company}` })) {
              const values = await this.tryValues({ ...key, path: `${probe.path}\\${company}\\${tag}\\InstallPath` });
              const exe = registryString(values, 'ExecutablePath');
              const dir = registryString(values, '');
              if (!exe && !dir) continue;
              const path = exe ?? `${dir!.replace(/\\+$/, '')}\\python.exe`;
              add(spec, { path, exe: path, version: tag.replace(/-(32|64|arm64)$/, ''), note: `PEP 514 ${company}` });
            }
          }
        } else if (probe.kind === 'java-home') {
          for (const version of await this.tryEnum({ ...key, path: probe.path })) {
            const home = registryString(await this.tryValues({ ...key, path: `${probe.path}\\${version}` }), 'JavaHome');
            if (home) {
              const exe = `${home.replace(/\\+$/, '')}\\bin\\java.exe`;
              add(spec, { path: exe, exe, version, note: 'JavaSoft registry' });
            }
          }
        } else {
          const dir = expandEnvStrings('%ProgramFiles%\\dotnet', new Map([...Object.entries(SYSTEM_EXPANSION_DEFAULTS), ...env]));
          for (const v of await this.tryValues({ ...key, path: probe.path })) if (v.name) add(spec, { path: dir, version: v.name, note: `${probe.valuePattern ?? 'install'} (registry)` });
        }
      }
    }
    return out;
  }

  // ---- version probes: preview first, execute only on the second explicit click -------------------------------

  protected previewProbes(): void {
    this.probeMessage.set('');
    this.plan.set(buildProbePlan(this.detections()));
  }

  protected cancelProbes(): void { this.plan.set(null); }

  protected async runProbes(): Promise<void> {
    const plan = this.plan();
    if (!plan?.length || this.running()) return;
    this.running.set(true);
    this.error.set('');
    try {
      const results = await this.probeService.probe(plan.map((p) => ({ id: p.key, exe: p.exe, args: p.args })));
      const byExe = new Map<string, string>();
      for (const r of results) {
        const item = plan.find((p) => p.key === r.id);
        if (!item || !r.ok) continue;
        const version = parseVersionOutput(item.runtime, r.stdout, r.stderr);
        if (version) byExe.set(item.exe.toLowerCase(), version);
      }
      this.detections.update((list) => list.map((d) => {
        const live = d.exe ? byExe.get(d.exe.toLowerCase()) : undefined;
        return live ? { ...d, liveVersion: live } : d;
      }));
      this.probeMessage.set(`Ran ${plan.length} command${plan.length === 1 ? '' : 's'}; ${byExe.size} reported a version.`);
      this.plan.set(null);
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : String(caught));
    } finally { this.running.set(false); }
  }

  // ---- export -----------------------------------------------------------------------------------------------------

  private snapshot() { return { detections: this.sorted(), conflicts: this.conflicts(), javaHome: this.javaHome() }; }
  protected exportJson(): void { downloadFile(new TextEncoder().encode(environmentJson(this.snapshot())), 'dev-environment.json', 'application/json'); }
  protected exportMarkdown(): void { downloadFile(new TextEncoder().encode(environmentMarkdown(this.snapshot())), 'dev-environment.md', 'text/markdown'); }
}
