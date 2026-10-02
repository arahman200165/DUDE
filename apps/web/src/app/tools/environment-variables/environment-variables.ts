import { Component, computed, inject, signal } from '@angular/core';
import { diffEnvironments, summarizeEnvDiff, toDiffViewEntries, type EnvDiffEntry } from "@dude/tool-engine/shared/system/env-diff";
import { parseEnvDump } from "@dude/tool-engine/shared/system/env-dump-parse";
import type { SysApplyResult, SysPlanPreview, SysPlanRequest, SysSnapshotHeader } from "@dude/contracts/system/sys-mutation-types";
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { SystemSnapshotService } from '../../core/platform/system-snapshot.service';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { DiffView } from '../../shared/components/diff-view/diff-view';
import { ElevationBanner } from '../../shared/components/elevation-banner/elevation-banner';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import {
  ENV_SCOPES, SCOPE_KEY, SCOPE_LABEL, buildExpansionMap, deleteRequest, filterEnvRows, rowsToRecord, setRequest, stringValues, toEnvRows, validateEnvName,
  type EditableScope, type EnvRow, type EnvScope, type RawEnvValue,
} from "@dude/tool-engine/tools/environment-variables/environment-variables-logic";

const TOOL_ID = 'environment-variables';

type Mode = 'variables' | 'compare';
type SideSource = EnvScope | 'snapshot' | 'paste';
interface Side { source: SideSource; snapshotId: string; paste: string }
interface Editor { kind: 'add' | 'edit'; name: string; value: string; expandable: boolean }

/**
 * Environment Variables (DUDE_PRD.md §21 Phase 31, Milestone 598). Reads the user, machine and
 * volatile environment from the registry; add / edit / delete only build an `env.set` / `env.delete`
 * plan request and open `app-system-change-preview`, whose separate confirm step is the only way a
 * change is applied. Volatile variables are read-only.
 */
@Component({
  selector: 'app-environment-variables',
  imports: [ToolShell, DataTable, DataTableCellDef, DesktopOnlyControl, DiffView, ElevationBanner, StatusGlyph, SystemChangePreview],
  templateUrl: './environment-variables.html',
})
export class EnvironmentVariablesTool {
  protected readonly platform = inject(PlatformService);
  private readonly system = inject(SystemInfoService);
  private readonly mutations = inject(SystemMutationService);
  private readonly snapshots = inject(SystemSnapshotService);
  private readonly persistence = inject(PersistenceService);

  protected readonly scopes = ENV_SCOPES;
  protected readonly label = SCOPE_LABEL;
  protected readonly scope = this.persistence.signal<EnvScope>(TOOL_ID, 'scope', 'local', 'user');
  protected readonly mode = signal<Mode>('variables');
  protected readonly query = signal('');
  protected readonly raw = signal<Partial<Record<EnvScope, readonly RawEnvValue[]>>>({});
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly selectedName = signal<string | null>(null);
  protected readonly editor = signal<Editor | null>(null);
  protected readonly editorError = signal('');
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly planning = signal(false);
  protected readonly snapshotName = signal('');
  protected readonly snapshotChoices = signal<readonly SysSnapshotHeader[]>([]);

  protected readonly sideA = signal<Side>({ source: 'user', snapshotId: '', paste: '' });
  protected readonly sideB = signal<Side>({ source: 'machine', snapshotId: '', paste: '' });
  protected readonly diffLabels = signal<{ a: string; b: string } | null>(null);
  protected readonly diffEntries = signal<readonly EnvDiffEntry[] | null>(null);
  protected readonly diffError = signal('');

  protected readonly editable = computed(() => this.scope() !== 'volatile');
  protected readonly rows = computed<EnvRow[]>(() => {
    const raw = this.raw();
    return toEnvRows(raw[this.scope()] ?? [], buildExpansionMap(raw));
  });
  protected readonly filtered = computed(() => filterEnvRows(this.rows(), this.query()));
  protected readonly selected = computed(() => this.rows().find((r) => r.name === this.selectedName()) ?? null);

  protected readonly columns: readonly DataTableColumn<EnvRow>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name, sortable: true, width: 'minmax(9rem, 14rem)' },
    { key: 'value', header: 'Value (raw)', value: (r) => r.value, sortable: true, truncate: true, width: 'minmax(12rem, 1fr)' },
    { key: 'expanded', header: 'Expanded', value: (r) => r.expanded, sortable: true, truncate: true, width: 'minmax(12rem, 1fr)' },
    { key: 'type', header: 'Type', value: (r) => r.type, sortable: true, width: '9rem' },
  ];
  protected readonly trackRow = (_: number, r: EnvRow): string => r.name;

  protected readonly diffView = computed(() => {
    const entries = this.diffEntries();
    return entries
      ? { entries: toDiffViewEntries(entries), summary: { ...summarizeEnvDiff(entries) }, paths: entries.filter((e) => e.pathBreakdown && (e.pathBreakdown.added.length || e.pathBreakdown.removed.length || e.pathBreakdown.reordered)) }
      : null;
  });

  constructor() {
    if (this.platform.isDesktop()) void this.reload();
  }

  protected async reload(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      const next: Partial<Record<EnvScope, RawEnvValue[]>> = {};
      // The expansion map needs all three scopes, so read them together.
      for (const s of ENV_SCOPES) next[s] = stringValues((await this.system.registryValues(SCOPE_KEY[s])).values);
      this.raw.set(next);
    } catch (caught) { this.fail(caught); }
    finally { this.loading.set(false); }
  }

  private fail(caught: unknown): void { this.error.set(caught instanceof Error ? caught.message : String(caught)); }

  protected setScope(s: EnvScope): void {
    this.scope.set(s);
    this.selectedName.set(null);
    this.editor.set(null);
    this.preview.set(null);
  }

  protected select(row: EnvRow): void { this.selectedName.set(row.name); }

  // ---- edit: every path only plans -----------------------------------------------------------

  protected startAdd(): void {
    this.editorError.set('');
    this.editor.set({ kind: 'add', name: '', value: '', expandable: false });
  }

  protected startEdit(): void {
    const row = this.selected();
    if (!row) return;
    this.editorError.set('');
    this.editor.set({ kind: 'edit', name: row.name, value: row.value, expandable: row.type === 'REG_EXPAND_SZ' });
  }

  protected patchEditor(patch: Partial<Editor>): void { this.editor.update((e) => (e ? { ...e, ...patch } : e)); }

  protected async previewSet(): Promise<void> {
    const e = this.editor();
    if (!e || !this.editable()) return;
    const problem = e.kind === 'add' ? validateEnvName(e.name) : null;
    if (problem) { this.editorError.set(problem); return; }
    this.editorError.set('');
    await this.plan(setRequest(this.scope() as EditableScope, e.name.trim(), e.value, e.expandable));
  }

  protected async previewDelete(): Promise<void> {
    const row = this.selected();
    if (!row || !this.editable()) return;
    await this.plan(deleteRequest(this.scope() as EditableScope, row.name));
  }

  /** Only asks the main process to build a plan; nothing is issued or applied here. */
  private async plan(request: SysPlanRequest): Promise<void> {
    this.error.set('');
    this.message.set('');
    this.planning.set(true);
    try { this.preview.set(await this.mutations.plan(request)); }
    catch (caught) { this.preview.set(null); this.fail(caught); }
    finally { this.planning.set(false); }
  }

  protected async onApplied(_: SysApplyResult): Promise<void> {
    this.editor.set(null);
    this.message.set('Applied. Running programs keep their old environment; only newly started processes see the change.');
    await this.reload();
  }

  // ---- snapshot -------------------------------------------------------------------------------

  protected async saveSnapshot(): Promise<void> {
    this.message.set('');
    this.error.set('');
    const s = this.scope();
    try {
      const header = await this.snapshots.save('env', this.snapshotName().trim() || `${SCOPE_LABEL[s]} environment`, `${SCOPE_KEY[s].hive}\\${SCOPE_KEY[s].path}`, rowsToRecord(this.raw()[s] ?? []));
      this.message.set(`Saved snapshot "${header.name}".`);
      this.snapshotName.set('');
    } catch (caught) { this.fail(caught); }
  }

  // ---- compare --------------------------------------------------------------------------------

  protected async openCompare(): Promise<void> {
    this.mode.set('compare');
    if (this.snapshots.available) {
      try { this.snapshotChoices.set((await this.snapshots.list('env'))); } catch { /* no snapshots to offer */ }
    }
  }

  protected patchSide(which: 'a' | 'b', patch: Partial<Side>): void {
    (which === 'a' ? this.sideA : this.sideB).update((s) => ({ ...s, ...patch }));
  }

  protected setSource(which: 'a' | 'b', value: string): void { this.patchSide(which, { source: value as SideSource }); }

  protected async compare(): Promise<void> {
    this.diffError.set('');
    this.diffEntries.set(null);
    try {
      const a = await this.resolve(this.sideA());
      const b = await this.resolve(this.sideB());
      this.diffLabels.set({ a: a.label, b: b.label });
      this.diffEntries.set(diffEnvironments(a.vars, b.vars));
    } catch (caught) { this.diffError.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  private async resolve(side: Side): Promise<{ label: string; vars: ReadonlyMap<string, string> | Record<string, string> }> {
    switch (side.source) {
      case 'snapshot': {
        const header = this.snapshotChoices().find((h) => h.id === side.snapshotId);
        if (!header) throw new Error('Choose a snapshot first.');
        const data = (await this.snapshots.get(header.kind, header.id)).data;
        if (!data || typeof data !== 'object') throw new Error('That snapshot does not hold an environment.');
        return { label: `Snapshot "${header.name}"`, vars: Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, String(v)])) };
      }
      case 'paste': {
        if (!side.paste.trim()) throw new Error('Paste a `set` dump, .env text, or a JSON object first.');
        return { label: 'Pasted environment', vars: parseEnvDump(side.paste) };
      }
      default: {
        const values = stringValues((await this.system.registryValues(SCOPE_KEY[side.source])).values);
        return { label: `${SCOPE_LABEL[side.source]} environment (live, unexpanded)`, vars: rowsToRecord(values) };
      }
    }
  }
}
