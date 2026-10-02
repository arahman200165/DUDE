import { AceRow, AclInspectorTool_categoryClass } from "@dude/tool-engine/tools/acl-inspector/acl-inspector.embedded-engine";
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import type { SysApplyResult, SysPlanPreview } from "@dude/contracts/system/sys-mutation-types";
import type { AclAce, AclGetResult, AclTarget, RegistryView } from "@dude/contracts/system/system-types";
import { parseRegistryPath } from "@dude/tool-engine/shared/system/registry-path";
import {
  aceFlagsFromByte, aceTypeFromByte, describeAce, describeRights, formatAce, parseSddl, sidTokenName, type ObjectKind,
} from "@dude/tool-engine/shared/system/sddl";
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { ElevationBanner } from '../../shared/components/elevation-banner/elevation-banner';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { aclRequest, buildAddAce, buildInheritance, buildRemoveAce, parseMask, rightsPresets, type InheritanceAction, type InheritScope } from "@dude/tool-engine/tools/acl-inspector/acl-inspector-logic";


@Component({
  selector: 'app-acl-inspector',
  imports: [NgTemplateOutlet, ToolShell, DesktopOnlyControl, CopyButton, SaveTextFile, StatusGlyph, ElevationBanner, SystemChangePreview],
  templateUrl: './acl-inspector.html',
})
export class AclInspectorTool {
  private readonly system = inject(SystemInfoService);
  private readonly nativeFs = inject(NativeFsService);
  private readonly mutations = inject(SystemMutationService);
  protected readonly platform = inject(PlatformService);
  protected readonly systemAvailable = () => this.system.available;
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly result = signal<AclGetResult | null>(null);
  protected readonly registryPath = signal('');
  protected readonly view = signal<RegistryView>('default');
  protected readonly account = signal('');

  // ---- edit state (every edit is previewed and confirmed through the system change engine) ----
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly planning = signal(false);
  protected readonly planError = signal('');
  protected readonly addOpen = signal(false);
  protected readonly principal = signal('');
  protected readonly aceKind = signal<'allow' | 'deny'>('allow');
  protected readonly preset = signal('RX');
  protected readonly customMask = signal('');
  protected readonly scope = signal<InheritScope>('oici');
  protected readonly inheritOnly = signal(false);
  protected readonly noPropagate = signal(false);
  protected readonly disableChoice = signal<InheritanceAction>('convert');
  protected readonly isRegistry = computed(() => this.result()?.target.kind === 'registry');
  protected readonly presets = computed(() => rightsPresets(this.isRegistry()));
  protected readonly scopeOptions = computed<readonly { value: InheritScope; label: string }[]>(() => this.isRegistry()
    ? [{ value: 'this', label: 'This key only' }, { value: 'ci', label: 'This key and subkeys (CI)' }]
    : [{ value: 'this', label: 'This object only' }, { value: 'oici', label: 'This folder, subfolders and files (OI)(CI)' }, { value: 'ci', label: 'This folder and subfolders (CI)' }, { value: 'oi', label: 'This folder and files (OI)' }]);
  protected readonly canEdit = computed(() => this.platform.isDesktop() && !!this.result());

  /** How the renderer decodes access masks: folder, file or registry key. */
  protected readonly objectKind = computed<ObjectKind>(() => {
    const r = this.result();
    if (!r) return 'file';
    return r.target.kind === 'registry' ? 'registry' : r.isContainer ? 'directory' : 'file';
  });
  protected readonly daclRows = computed(() => this.rowsFor(this.result()?.dacl ?? []));
  protected readonly saclRows = computed(() => { const s = this.result()?.sacl; return s ? this.rowsFor(s) : null; });
  protected readonly targetLabel = computed(() => {
    const t = this.result()?.target;
    return !t ? '' : t.kind === 'registry' ? `${t.hive}\\${t.path}` : t.path;
  });
  protected readonly effective = computed(() => {
    const e = this.result()?.effective;
    return e ? { ...e, rights: describeRights(e.mask, this.objectKind()) } : null;
  });
  /** One line per section / ACE, for the SDDL breakdown. */
  protected readonly sddlLines = computed(() => {
    const r = this.result();
    if (!r) return [];
    try {
      const sd = parseSddl(r.sddl);
      const lines: string[] = [];
      if (sd.owner !== undefined) lines.push(`O:${sd.owner}`);
      if (sd.group !== undefined) lines.push(`G:${sd.group}`);
      if (sd.dacl) { lines.push(`D:${sd.dacl.flags.join('')}`); for (const a of sd.dacl.aces) lines.push(`  ${formatAce(a)}`); }
      if (sd.sacl) { lines.push(`S:${sd.sacl.flags.join('')}`); for (const a of sd.sacl.aces) lines.push(`  ${formatAce(a)}`); }
      return lines;
    } catch { return [r.sddl]; }
  });

  protected async pickFile(): Promise<void> {
    try {
      const picked = await this.nativeFs.pickFile();
      if (!picked.canceled) await this.inspect({ kind: 'file', path: picked.path });
    } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }

  protected async pickFolder(): Promise<void> {
    try {
      const picked = await this.nativeFs.pickDirectory();
      if (!picked.canceled) await this.inspect({ kind: 'file', path: picked.rootPath });
    } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }

  protected async inspectRegistry(): Promise<void> {
    const ref = parseRegistryPath(this.registryPath());
    if (!ref) { this.error.set('Enter a registry key such as HKLM\\SOFTWARE\\Microsoft, HKEY_CURRENT_USER\\Software or HKCU:\\Software.'); return; }
    if (!ref.path) { this.error.set('Enter a key below the hive, for example HKLM\\SOFTWARE.'); return; }
    await this.inspect({ kind: 'registry', hive: ref.hive, path: ref.path, view: this.view() });
  }

  protected async calculateEffective(): Promise<void> {
    const target = this.result()?.target;
    if (target && this.account().trim()) await this.inspect(target, true);
  }

  private async inspect(target: AclTarget, includeAccount = false): Promise<void> {
    this.loading.set(true); this.error.set(''); this.result.set(null); this.preview.set(null); this.planError.set('');
    try { this.result.set(await this.system.call('acl.get', { target, ...(includeAccount ? { account: this.account().trim() } : {}) })); }
    catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
    finally { this.loading.set(false); }
  }

  // ---- edit actions: each only builds a request and asks main for a preview; nothing is applied here ----

  protected toggleAdd(): void { this.addOpen.update((open) => !open); this.planError.set(''); }

  protected async previewAdd(): Promise<void> {
    const acl = this.result();
    if (!acl) return;
    await this.plan(async () => {
      const raw = this.principal().trim();
      if (!raw) throw new Error('Enter an account name or SID.');
      const sid = /^S-\d-/i.test(raw) ? raw.toUpperCase() : (await this.system.call('sid.lookup', { lookupKind: 'account', query: raw })).sid;
      const custom = this.preset() === 'custom';
      const mask = custom ? parseMask(this.customMask()) : this.presets().find((item) => item.id === this.preset())?.mask ?? null;
      if (!mask) throw new Error('Enter a custom access mask such as 0x1200a9.');
      const scope: InheritScope = acl.isContainer ? this.scope() : 'this';
      const after = buildAddAce(acl.sddl, { sid, kind: this.aceKind(), mask, scope, inheritOnly: this.inheritOnly(), noPropagate: this.noPropagate() });
      return aclRequest(acl.target, `${this.aceKind() === 'deny' ? 'Deny' : 'Allow'} ${raw} on ${this.targetLabel()}`, acl.sddl, after);
    });
  }

  protected async previewRemove(row: AceRow): Promise<void> {
    const acl = this.result();
    if (!acl || row.inherited) return;
    await this.plan(() => aclRequest(acl.target, `Remove permission entry for ${row.principal} on ${this.targetLabel()}`, acl.sddl, buildRemoveAce(acl.sddl, row.key)));
  }

  protected async previewInheritance(action: InheritanceAction): Promise<void> {
    const acl = this.result();
    if (!acl) return;
    const title = action === 'enable' ? 'Enable inheritance' : action === 'convert' ? 'Disable inheritance (convert inherited entries to explicit)' : 'Disable inheritance (remove inherited entries)';
    await this.plan(() => aclRequest(acl.target, `${title} on ${this.targetLabel()}`, acl.sddl, buildInheritance(acl.sddl, action)));
  }

  private async plan(build: () => Promise<ReturnType<typeof aclRequest>> | ReturnType<typeof aclRequest>): Promise<void> {
    this.planning.set(true); this.planError.set(''); this.preview.set(null);
    try { this.preview.set(await this.mutations.plan(await build())); }
    catch (error) { this.planError.set(error instanceof Error ? error.message : String(error)); }
    finally { this.planning.set(false); }
  }

  protected onApplied(_result: SysApplyResult): void {
    const target = this.result()?.target;
    this.preview.set(null);
    if (target) void this.inspect(target);
  }
  protected clearPreview(): void { this.preview.set(null); }
  protected onPrincipalInput(event: Event): void { this.principal.set((event.target as HTMLInputElement).value); }
  protected onPreset(event: Event): void { this.preset.set((event.target as HTMLSelectElement).value); }
  protected onScope(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as InheritScope;
    this.scope.set(value);
    if (value === 'this') { this.inheritOnly.set(false); this.noPropagate.set(false); }
  }

  private rowsFor(aces: readonly AclAce[]): AceRow[] {
    const kind = this.objectKind();
    return aces.map((ace, key) => {
      const type = aceTypeFromByte(ace.aceType);
      const flags = aceFlagsFromByte(ace.flags);
      const d = describeAce({ type, flags, mask: ace.mask }, kind);
      const wellKnown = ace.sid ? sidTokenName(ace.sid) : null;
      const principal = ace.account ?? wellKnown ?? ace.sid ?? 'Unknown principal';
      const raw = d.category === 'other';
      return {
        key, type: d.typeName, category: d.category, principal, sid: ace.sid ?? '', named: principal !== ace.sid,
        summary: raw ? 'Not decoded' : d.rights.summary, short: raw ? '' : d.rights.short,
        details: raw ? [] : d.rights.names, hex: d.rights.hex, icacls: d.icacls, scope: d.scope,
        inherited: ace.inherited, inheritedFrom: ace.inheritedFrom,
        auditFlags: d.category === 'audit' ? [flags.includes('SA') ? 'success' : '', flags.includes('FA') ? 'failure' : ''].filter(Boolean).join(' + ') : '',
      };
    });
  }

  protected onRegistryInput(event: Event): void { this.registryPath.set((event.target as HTMLInputElement).value); }
  protected setView(event: Event): void { this.view.set((event.target as HTMLSelectElement).value as RegistryView); }
  protected descriptorJson(): string { return this.result() ? JSON.stringify(this.result(), null, 2) : ''; }
  protected categoryClass = AclInspectorTool_categoryClass;

}
