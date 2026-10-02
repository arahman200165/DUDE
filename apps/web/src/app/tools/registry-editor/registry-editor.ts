import { RegistryEditorTool_matchLabel } from "@dude/tool-engine/tools/registry-editor/registry-editor.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { diffRegistry, regKeysToMap, summarizeRegDiff, toRegDiffViewEntries, type RegDiffEntry, type RegTreeMap } from "@dude/tool-engine/shared/system/reg-diff";
import { formatRegData, parseRegFile } from "@dude/tool-engine/shared/system/reg-file";
import type { SysApplyResult, SysPlanPreview, SysPlanRequest, SysSnapshotHeader } from "@dude/contracts/system/sys-mutation-types";
import { REGISTRY_HIVES, type RegistrySearchMatch, type RegistrySearchResult, type RegistrySubkey, type RegistryValue, type RegistryValueType, type RegistryView } from "@dude/contracts/system/system-types";
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { SystemSnapshotService } from '../../core/platform/system-snapshot.service';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { DiffView } from '../../shared/components/diff-view/diff-view';
import { ElevationBanner } from '../../shared/components/elevation-banner/elevation-banner';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { downloadFile } from '../../shared/utils/download-file';
import {
  EDITABLE_TYPES, TOOL_ID, createKeyRequest, decodeRegBytes, deleteValueRequest, displayPath, encodeUtf16leWithBom, exportFileName, joinPath, keyId,
  longPath, needsElevation, parseRegistryPath, parseValueText, powerShellCommand, regExeCommand, setValueRequest, subtreeOf, validateKeyName, valueLabel, valueToText,
  type KeyRef,
} from "@dude/tool-engine/tools/registry-editor/registry-editor-logic";

type Panel = 'values' | 'search' | 'diff';
type DiffSource = 'snapshot' | 'file';

interface TreeRow { readonly id: string; readonly ref: KeyRef; readonly label: string; readonly depth: number; readonly expandable: boolean; readonly expanded: boolean; readonly loading: boolean; readonly error: string }
interface ValueRow { readonly name: string; readonly label: string; readonly type: RegistryValueType; readonly display: string; readonly source: RegistryValue }
interface Editor { kind: 'new' | 'edit'; name: string; type: RegistryValueType; text: string }

/**
 * Registry Editor (DUDE_PRD.md §21 Phase 31, Milestone 601). Reads through the system helper
 * (`reg.enumKey`, `reg.getValues`, `reg.search`, `reg.export`); every edit only builds a
 * `registry.*` plan request and opens `app-system-change-preview`, whose separate confirm step is the
 * only way a change is applied.
 */
@Component({
  selector: 'app-registry-editor',
  imports: [ToolShell, CopyButton, DataTable, DesktopOnlyControl, DiffView, ElevationBanner, StatusGlyph, SystemChangePreview],
  templateUrl: './registry-editor.html',
})
export class RegistryEditorTool {
  protected readonly platform = inject(PlatformService);
  private readonly system = inject(SystemInfoService);
  private readonly mutations = inject(SystemMutationService);
  private readonly snapshots = inject(SystemSnapshotService);
  private readonly persistence = inject(PersistenceService);

  protected readonly editableTypes = EDITABLE_TYPES;
  protected readonly view = this.persistence.signal<RegistryView>(TOOL_ID, 'view', 'local', 'default');
  protected readonly favorites = this.persistence.signal<string[]>(TOOL_ID, 'favorites', 'local', []);
  protected readonly panel = signal<Panel>('values');

  // tree
  private readonly children = signal<ReadonlyMap<string, readonly RegistrySubkey[]>>(new Map());
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  private readonly loadingKeys = signal<ReadonlySet<string>>(new Set());
  private readonly keyErrors = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly selected = signal<KeyRef | null>(null);
  protected readonly pathInput = signal('');
  protected readonly pathError = signal('');

  protected readonly rows = computed<TreeRow[]>(() => {
    const out: TreeRow[] = [];
    const kids = this.children();
    const open = this.expanded();
    const walk = (ref: KeyRef, label: string, depth: number, known: boolean | number): void => {
      const id = keyId(ref);
      const loaded = kids.get(id);
      const isOpen = open.has(id);
      out.push({
        id, ref, label, depth, expanded: isOpen, loading: this.loadingKeys().has(id), error: this.keyErrors().get(id) ?? '',
        expandable: loaded ? loaded.length > 0 : known !== 0,
      });
      if (isOpen && loaded) for (const sub of loaded) walk({ hive: ref.hive, path: joinPath(ref.path, sub.name) }, sub.name, depth + 1, sub.subkeyCount);
    };
    for (const hive of REGISTRY_HIVES) walk({ hive, path: '' }, hive, 0, true);
    return out;
  });

  // values
  protected readonly values = signal<readonly RegistryValue[]>([]);
  protected readonly valuesLoading = signal(false);
  protected readonly selectedValueName = signal<string | null>(null);
  protected readonly valueRows = computed<ValueRow[]>(() =>
    this.values().map((v) => ({ name: v.name, label: valueLabel(v.name), type: v.type, display: formatRegData(v.type, v.data), source: v })));
  protected readonly selectedValue = computed(() => this.valueRows().find((r) => r.name === this.selectedValueName()) ?? null);
  protected readonly valueColumns: readonly DataTableColumn<ValueRow>[] = [
    { key: 'label', header: 'Name', value: (r) => r.label, sortable: true, width: 'minmax(9rem, 16rem)' },
    { key: 'type', header: 'Type', value: (r) => r.type, sortable: true, width: '11rem' },
    { key: 'display', header: 'Data', value: (r) => r.display, truncate: true, width: 'minmax(12rem, 1fr)' },
  ];
  protected readonly trackValue = (_: number, r: ValueRow): string => r.name;

  // status
  protected readonly error = signal('');
  protected readonly message = signal('');

  // editing
  protected readonly editor = signal<Editor | null>(null);
  protected readonly editorError = signal('');
  protected readonly newKeyName = signal('');
  protected readonly newKeyOpen = signal(false);
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly planning = signal(false);

  // search
  protected readonly query = signal('');
  protected readonly regex = signal(false);
  protected readonly matchKeys = signal(true);
  protected readonly matchNames = signal(true);
  protected readonly matchData = signal(true);
  protected readonly searching = signal(false);
  protected readonly searchResult = signal<RegistrySearchResult | null>(null);
  protected readonly searchScope = computed(() => { const s = this.selected(); return s ? displayPath(s) : 'all hives (select a key to narrow the search)'; });

  // export / diff
  protected readonly recursive = signal(true);
  protected readonly diffSource = signal<DiffSource>('snapshot');
  protected readonly snapshotChoices = signal<readonly SysSnapshotHeader[]>([]);
  protected readonly snapshotId = signal('');
  protected readonly snapshotName = signal('');
  protected readonly fileTree = signal<{ name: string; tree: RegTreeMap } | null>(null);
  protected readonly diffEntries = signal<readonly RegDiffEntry[] | null>(null);
  protected readonly diffError = signal('');
  protected readonly diffLabel = signal('');
  protected readonly diffView = computed(() => {
    const entries = this.diffEntries();
    return entries ? { entries: toRegDiffViewEntries(entries), summary: { ...summarizeRegDiff(entries) } } : null;
  });

  protected readonly elevationNeeded = computed(() => { const s = this.selected(); return !!s && needsElevation(s.hive); });
  protected readonly selectedPath = computed(() => { const s = this.selected(); return s ? displayPath(s) : ''; });
  protected readonly regExe = computed(() => { const s = this.selected(); return s ? regExeCommand(s, this.view()) : ''; });
  protected readonly powerShell = computed(() => { const s = this.selected(); return s ? powerShellCommand(s) : ''; });
  protected readonly isFavorite = computed(() => this.favorites().includes(this.selectedPath()));

  constructor() {
    if (this.platform.isDesktop()) {
      const first = this.favorites()[0] ? parseRegistryPath(this.favorites()[0]) : null;
      if (first) void this.reveal(first);
    }
  }

  private fail(caught: unknown): void { this.error.set(caught instanceof Error ? caught.message : String(caught)); }

  // ---- tree ------------------------------------------------------------------------------------------

  private async load(ref: KeyRef): Promise<void> {
    const id = keyId(ref);
    if (this.children().has(id)) return;
    this.loadingKeys.update((s) => new Set(s).add(id));
    try {
      const result = await this.system.enumRegistryKey({ hive: ref.hive, path: ref.path, view: this.view() });
      const subs = [...result.subkeys].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      this.children.update((m) => new Map(m).set(id, subs));
      this.keyErrors.update((m) => { const n = new Map(m); n.delete(id); return n; });
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : String(caught);
      this.keyErrors.update((m) => new Map(m).set(id, text));
      this.expanded.update((s) => { const n = new Set(s); n.delete(id); return n; });
    } finally {
      this.loadingKeys.update((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  protected async toggle(row: TreeRow): Promise<void> {
    if (row.expanded) { this.expanded.update((s) => { const n = new Set(s); n.delete(row.id); return n; }); return; }
    this.expanded.update((s) => new Set(s).add(row.id));
    await this.load(row.ref);
  }

  protected async select(ref: KeyRef): Promise<void> {
    this.selected.set(ref);
    this.pathInput.set(displayPath(ref));
    this.pathError.set('');
    this.error.set('');
    this.selectedValueName.set(null);
    this.editor.set(null);
    this.newKeyOpen.set(false);
    this.preview.set(null);
    this.diffEntries.set(null);
    await this.loadValues();
  }

  private async loadValues(): Promise<void> {
    const ref = this.selected();
    if (!ref || !ref.path) { this.values.set([]); return; }
    this.valuesLoading.set(true);
    try { this.values.set((await this.system.registryValues({ hive: ref.hive, path: ref.path, view: this.view() })).values); }
    catch (caught) { this.values.set([]); this.fail(caught); }
    finally { this.valuesLoading.set(false); }
  }

  /** Expands every ancestor of `ref` (loading as it goes) and selects it. */
  protected async reveal(ref: KeyRef): Promise<void> {
    const segments = ref.path ? ref.path.split('\\') : [];
    let cursor: KeyRef = { hive: ref.hive, path: '' };
    for (let i = 0; i <= segments.length; i++) {
      await this.load(cursor);
      this.expanded.update((s) => new Set(s).add(keyId(cursor)));
      if (i < segments.length) cursor = { hive: ref.hive, path: joinPath(cursor.path, segments[i]) };
    }
    await this.select(ref);
  }

  protected async go(): Promise<void> {
    const ref = parseRegistryPath(this.pathInput());
    if (!ref) { this.pathError.set('Not a registry path. Try HKLM\\SOFTWARE\\..., Computer\\HKEY_LOCAL_MACHINE\\... or HKLM:\\SOFTWARE\\...'); return; }
    this.pathError.set('');
    await this.reveal(ref);
  }

  protected async setView(view: RegistryView): Promise<void> {
    this.view.set(view);
    const current = this.selected();
    this.children.set(new Map());
    this.expanded.set(new Set());
    if (current) await this.reveal(current);
  }

  protected toggleFavorite(): void {
    const path = this.selectedPath();
    if (!path) return;
    this.favorites.update((f) => (f.includes(path) ? f.filter((x) => x !== path) : [...f, path]));
  }

  protected async openFavorite(path: string): Promise<void> {
    const ref = parseRegistryPath(path);
    if (ref) await this.reveal(ref);
  }

  protected selectValue(row: ValueRow): void { this.selectedValueName.set(row.name); }

  // ---- edit: every path only plans -------------------------------------------------------------------

  protected startNewValue(): void {
    this.editorError.set('');
    this.newKeyOpen.set(false);
    this.editor.set({ kind: 'new', name: '', type: 'REG_SZ', text: '' });
  }

  protected startEditValue(): void {
    const row = this.selectedValue();
    if (!row) return;
    this.editorError.set('');
    this.newKeyOpen.set(false);
    const type = EDITABLE_TYPES.includes(row.type) ? row.type : 'REG_BINARY';
    this.editor.set({ kind: 'edit', name: row.name, type, text: valueToText(row.source) });
  }

  protected patchEditor(patch: Partial<Editor>): void { this.editor.update((e) => (e ? { ...e, ...patch } : e)); }

  protected async previewSet(): Promise<void> {
    const e = this.editor();
    const ref = this.selected();
    if (!e || !ref || !ref.path) return;
    const parsed = parseValueText(e.type, e.text);
    if (!parsed.ok) { this.editorError.set(parsed.error); return; }
    this.editorError.set('');
    await this.plan(setValueRequest(ref, this.view(), e.name, e.type, parsed.data));
  }

  protected async previewDelete(): Promise<void> {
    const ref = this.selected();
    const row = this.selectedValue();
    if (!ref || !row) return;
    await this.plan(deleteValueRequest(ref, this.view(), row.name));
  }

  protected async previewNewKey(): Promise<void> {
    const ref = this.selected();
    if (!ref) return;
    const problem = validateKeyName(this.newKeyName());
    if (problem) { this.editorError.set(problem); return; }
    this.editorError.set('');
    await this.plan(createKeyRequest({ hive: ref.hive, path: joinPath(ref.path, this.newKeyName().trim()) }, this.view()));
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
    this.newKeyOpen.set(false);
    this.newKeyName.set('');
    this.message.set('Applied.');
    const current = this.selected();
    if (current) {
      this.children.update((m) => { const n = new Map(m); n.delete(keyId(current)); return n; });
      await this.load(current);
      await this.loadValues();
    }
  }

  // ---- search ----------------------------------------------------------------------------------------

  protected async runSearch(): Promise<void> {
    const q = this.query().trim();
    if (!q) return;
    this.error.set('');
    this.searchResult.set(null);
    this.searching.set(true);
    const scope = this.selected();
    try {
      this.searchResult.set(await this.system.call('reg.search', {
        hive: scope?.hive ?? 'HKCU', path: scope?.path ?? '', view: this.view(), query: q, regex: this.regex(),
        matchKeys: this.matchKeys(), matchValueNames: this.matchNames(), matchValueData: this.matchData(),
      }));
    } catch (caught) { this.fail(caught); }
    finally { this.searching.set(false); }
  }

  protected async jump(match: RegistrySearchMatch): Promise<void> {
    const ref = parseRegistryPath(match.keyPath);
    if (!ref) return;
    this.panel.set('values');
    await this.reveal(ref);
    if (match.valueName !== undefined) this.selectedValueName.set(match.valueName);
  }
  protected matchLabel = RegistryEditorTool_matchLabel;


  // ---- export ----------------------------------------------------------------------------------------

  private async exportText(ref: KeyRef, recursive: boolean): Promise<string> {
    return (await this.system.call('reg.export', { hive: ref.hive, path: ref.path, view: this.view(), recursive })).text;
  }

  protected async exportReg(): Promise<void> {
    const ref = this.selected();
    if (!ref) return;
    this.error.set('');
    try {
      const text = await this.exportText(ref, this.recursive());
      // regedit writes UTF-16LE with a BOM; do the same so the file imports cleanly.
      downloadFile(encodeUtf16leWithBom(text), exportFileName(ref), 'text/plain');
      this.message.set(`Exported ${displayPath(ref)} as a UTF-16 .reg file.`);
    } catch (caught) { this.fail(caught); }
  }

  // ---- snapshot & diff -------------------------------------------------------------------------------

  protected async openDiff(): Promise<void> {
    this.panel.set('diff');
    if (this.snapshots.available) {
      try { this.snapshotChoices.set(await this.snapshots.list('registry')); } catch { /* nothing to offer */ }
    }
  }

  protected async saveSnapshot(): Promise<void> {
    const ref = this.selected();
    if (!ref) return;
    this.error.set('');
    this.message.set('');
    try {
      const tree = regKeysToMap(parseRegFile(await this.exportText(ref, true)).keys);
      const header = await this.snapshots.save('registry', this.snapshotName().trim() || displayPath(ref), displayPath(ref), { root: longPath(ref), tree });
      this.message.set(`Saved snapshot "${header.name}".`);
      this.snapshotName.set('');
      if (this.panel() === 'diff') this.snapshotChoices.set(await this.snapshots.list('registry'));
    } catch (caught) { this.fail(caught); }
  }

  protected async onRegFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.diffError.set('');
    try {
      const text = decodeRegBytes(new Uint8Array(await file.arrayBuffer()));
      this.fileTree.set({ name: file.name, tree: regKeysToMap(parseRegFile(text).keys) });
    } catch (caught) { this.diffError.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected async compare(): Promise<void> {
    const ref = this.selected();
    this.diffError.set('');
    this.diffEntries.set(null);
    if (!ref) { this.diffError.set('Select a key to compare.'); return; }
    try {
      let before: RegTreeMap;
      if (this.diffSource() === 'snapshot') {
        const header = this.snapshotChoices().find((h) => h.id === this.snapshotId());
        if (!header) throw new Error('Choose a snapshot first.');
        const data = (await this.snapshots.get(header.kind, header.id)).data as { tree?: RegTreeMap } | null;
        if (!data?.tree) throw new Error('That snapshot does not hold a registry tree.');
        before = data.tree;
        this.diffLabel.set(`Snapshot "${header.name}" → live ${displayPath(ref)}`);
      } else {
        const file = this.fileTree();
        if (!file) throw new Error('Choose a .reg file first.');
        before = file.tree;
        this.diffLabel.set(`${file.name} → live ${displayPath(ref)}`);
      }
      const live = regKeysToMap(parseRegFile(await this.exportText(ref, true)).keys);
      this.diffEntries.set(diffRegistry(subtreeOf(before, ref), subtreeOf(live, ref)));
    } catch (caught) { this.diffError.set(caught instanceof Error ? caught.message : String(caught)); }
  }

  protected asInput(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value; }
  protected asChecked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
}
