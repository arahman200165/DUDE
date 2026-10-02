import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DEFAULT_PATHEXT, analyzePath, dedupeRaw, detectShadows, effectiveEntries, entriesFromRaw, moveItem, normalizeDir, parsePath, parsePathExt, probeMap, probeTargets,
  type PathIssue, type PathScope,
} from "@dude/tool-engine/shared/system/path-analysis";
import type { SysApplyResult, SysPlanPreview } from "@dude/contracts/system/sys-mutation-types";
import type { ProbeDirEntry } from "@dude/contracts/system/system-types";
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { ElevationBanner } from '../../shared/components/elevation-banner/elevation-banner';
import { FindingsList } from '../../shared/components/findings-list/findings-list';
import { StatusGlyph, type StatusGlyphKind } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import {
  ISSUE_LABEL, PATH_ENV_KEYS, PATH_SCOPE_LABEL, PATH_VIEW_SCOPES, RUNTIME_DETECTOR_ROUTE, buildPathExpansionMap, findEnvValue, pathSetRequest, sameList, shadowFindings, stringEnv,
  type EditablePathScope, type EnvStringValue, type PathViewScope,
} from './path-editor-logic';

const TOOL_ID = 'path-editor';

interface Row {
  readonly index: number;
  readonly raw: string;
  readonly expanded: string;
  readonly scope?: PathScope;
  readonly issues: readonly PathIssue[];
  readonly checked: boolean;
  readonly exists: boolean;
}

type ScopeLists = Record<EditablePathScope, string[]>;

/**
 * PATH Editor & Conflict Detector (DUDE_PRD.md §21 Phase 31, Milestone 599). Reads the user and machine
 * PATH from the registry, probes every directory, and lets the raw entries be reordered, added, removed
 * and de-duplicated in memory. Nothing is written until Save, which only builds one `env.set` plan and
 * hands it to `app-system-change-preview`; that component's separate confirm step is the only way to apply.
 */
@Component({
  selector: 'app-path-editor',
  imports: [RouterLink, ToolShell, DesktopOnlyControl, ElevationBanner, FindingsList, StatusGlyph, SystemChangePreview],
  templateUrl: './path-editor.html',
})
export class PathEditorTool {
  protected readonly platform = inject(PlatformService);
  private readonly system = inject(SystemInfoService);
  private readonly mutations = inject(SystemMutationService);
  private readonly persistence = inject(PersistenceService);

  protected readonly scopes = PATH_VIEW_SCOPES;
  protected readonly label = PATH_SCOPE_LABEL;
  protected readonly runtimeDetector = RUNTIME_DETECTOR_ROUTE;
  protected readonly scope = this.persistence.signal<PathViewScope>(TOOL_ID, 'scope', 'local', 'user');

  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly planning = signal(false);
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly addText = signal('');

  private readonly original = signal<ScopeLists>({ user: [], machine: [] });
  private readonly edited = signal<Partial<ScopeLists>>({});
  private readonly envValues = signal<Partial<Record<EditablePathScope | 'volatile', readonly EnvStringValue[]>>>({});
  private readonly probed = signal<ReadonlyMap<string, ProbeDirEntry>>(new Map());

  protected readonly editable = computed(() => this.scope() !== 'effective');
  private readonly env = computed(() => buildPathExpansionMap(this.envValues()));
  private readonly pathext = computed(() => {
    const v = this.envValues();
    const raw = findEnvValue(v.user ?? [], 'PATHEXT') ?? findEnvValue(v.machine ?? [], 'PATHEXT');
    const parsed = raw ? parsePathExt(raw) : [];
    return parsed.length ? parsed : [...DEFAULT_PATHEXT];
  });

  private working(scope: EditablePathScope): string[] { return this.edited()[scope] ?? this.original()[scope]; }

  private readonly userEntries = computed(() => entriesFromRaw(this.working('user'), this.env()));
  private readonly machineEntries = computed(() => entriesFromRaw(this.working('machine'), this.env()));
  private readonly effective = computed(() => effectiveEntries(this.machineEntries(), this.userEntries()));

  protected readonly dirty = computed(() => {
    const s = this.scope();
    return s !== 'effective' && !sameList(this.working(s), this.original()[s]);
  });
  protected readonly canSave = computed(() => this.dirty() && this.working(this.scope() as EditablePathScope).some((r) => r.trim() !== '') && !this.planning());

  protected readonly rows = computed<Row[]>(() => {
    const scope = this.scope();
    const probe = this.probed();
    const entries = scope === 'effective' ? this.effective() : scope === 'user' ? this.userEntries() : this.machineEntries();
    const analysis = analyzePath(entries, probe).entries;
    return entries.map((e, i) => {
      const p = probe.get(normalizeDir(e.expanded));
      return {
        index: i,
        raw: e.raw,
        expanded: e.expanded,
        scope: 'scope' in e ? (e as { scope: PathScope }).scope : undefined,
        issues: analysis[i]?.issues ?? [],
        checked: !!p,
        exists: !!p && p.exists && p.isDirectory,
      };
    });
  });

  protected readonly global = computed(() => {
    const scope = this.scope();
    const entries = scope === 'effective' ? this.effective() : scope === 'user' ? this.userEntries() : this.machineEntries();
    return analyzePath(entries, this.probed()).global;
  });

  /** Shadowing is always judged on the effective PATH (machine first), including unsaved edits. */
  protected readonly shadows = computed(() => detectShadows(this.effective(), this.probed(), this.pathext()));
  protected readonly shadowSummary = computed(() => shadowFindings(this.shadows()));

  constructor() {
    if (this.platform.isDesktop()) void this.reload();
  }

  protected async reload(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      const env: Partial<Record<EditablePathScope | 'volatile', EnvStringValue[]>> = {};
      for (const s of ['machine', 'user', 'volatile'] as const) env[s] = stringEnv((await this.system.registryValues(PATH_ENV_KEYS[s])).values);
      const rawOf = (s: EditablePathScope) => parsePath(findEnvValue(env[s] ?? [], 'PATH') ?? '').map((e) => e.raw);
      this.envValues.set(env);
      this.original.set({ user: rawOf('user'), machine: rawOf('machine') });
      this.edited.set({});
      this.preview.set(null);
      await this.probeMissing();
    } catch (caught) { this.fail(caught); }
    finally { this.loading.set(false); }
  }

  private fail(caught: unknown): void { this.error.set(caught instanceof Error ? caught.message : String(caught)); }

  /** Reads which directories exist; already-probed directories are not asked for again. */
  private async probeMissing(): Promise<void> {
    const known = this.probed();
    const dirs = probeTargets([...this.userEntries(), ...this.machineEntries()]).filter((d) => !known.has(normalizeDir(d)));
    if (!dirs.length) return;
    try {
      const result = await this.system.call('fs.probeDirs', { dirs, extensions: this.pathext() });
      const next = new Map(known);
      for (const [k, v] of probeMap(result.dirs)) next.set(k, v);
      this.probed.set(next);
    } catch (caught) { this.fail(caught); }
  }

  protected setScope(s: PathViewScope): void {
    this.scope.set(s);
    this.preview.set(null);
    this.message.set('');
  }

  // ---- edits: in-memory only; nothing here plans or applies ------------------------------------

  private edit(update: (list: string[]) => string[]): void {
    const s = this.scope();
    if (s === 'effective') return;
    this.preview.set(null);
    this.message.set('');
    this.edited.update((e) => ({ ...e, [s]: update(this.working(s)) }));
  }

  protected move(from: number, to: number): void { this.edit((list) => moveItem(list, from, to)); }
  protected remove(index: number): void { this.edit((list) => list.filter((_, i) => i !== index)); }
  protected dedupe(): void { this.edit((list) => dedupeRaw(list, this.env())); }
  protected discardEdits(): void {
    const s = this.scope();
    if (s === 'effective') return;
    this.preview.set(null);
    this.edited.update((e) => ({ ...e, [s]: undefined }));
  }

  protected async add(): Promise<void> {
    const text = this.addText().trim();
    if (!text) return;
    this.edit((list) => [...list, text]);
    this.addText.set('');
    await this.probeMissing();
  }

  protected onKey(event: KeyboardEvent, index: number): void {
    if (!this.editable()) return;
    if (event.altKey && event.key === 'ArrowUp') { event.preventDefault(); this.move(index, index - 1); }
    else if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); this.move(index, index + 1); }
    else if (event.key === 'Delete') { event.preventDefault(); this.remove(index); }
  }

  // ---- save: only plans --------------------------------------------------------------------------

  /** Builds one `env.set` plan for the scope; nothing is issued or applied here. */
  protected async save(): Promise<void> {
    const s = this.scope();
    if (s === 'effective' || !this.canSave()) return;
    this.error.set('');
    this.message.set('');
    this.planning.set(true);
    try { this.preview.set(await this.mutations.plan(pathSetRequest(s, this.working(s)))); }
    catch (caught) { this.preview.set(null); this.fail(caught); }
    finally { this.planning.set(false); }
  }

  protected async onApplied(_: SysApplyResult): Promise<void> {
    this.message.set('Applied. Running programs keep their old PATH; only newly started processes see the change.');
    await this.reload();
  }

  // ---- presentation helpers ------------------------------------------------------------------------

  protected issueLabel(issue: PathIssue): string { return ISSUE_LABEL[issue.kind]; }
  protected glyph(issue: PathIssue): StatusGlyphKind { return issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info'; }
}
