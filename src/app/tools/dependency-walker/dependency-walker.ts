import { Component, computed, inject, signal } from '@angular/core';
import { PlatformService } from '../../core/platform/platform.service';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import type { DependencyImportResult, DependencyNode } from '../../../shared-logic/system/dependency-walker-types';
interface WalkerRow { readonly depth: number; readonly module: string; readonly result: string; readonly location: string; readonly detail: string; }
@Component({ selector: 'app-dependency-walker', imports: [ToolShell, DesktopOnlyControl], templateUrl: './dependency-walker.html' })
export class DependencyWalkerTool {
  protected readonly platform = inject(PlatformService);
  private readonly systemInfo = inject(SystemInfoService);
  private readonly nativeFs = inject(NativeFsService);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly root = signal<DependencyNode | null>(null);
  protected readonly rootPath = signal('');
  protected readonly rows = computed(() => {
    const rows: WalkerRow[] = [];
    const visit = (node: DependencyNode): void => { for (const item of node.imports) { rows.push({ depth: node.depth + 1, module: item.name, result: item.status, location: item.path ?? '', detail: this.details(item) }); if (item.child) visit(item.child); } };
    const root = this.root(); if (root) visit(root); return rows;
  });
  protected async choose(): Promise<void> {
    if (!window.dude?.dependencyWalker) return;
    this.error.set(''); this.root.set(null); this.loading.set(true);
    try { const picked = await this.nativeFs.pickFile(); if (picked.canceled) return; this.rootPath.set(picked.path); this.root.set(await this.systemInfo.walkDependencies(picked.path)); }
    catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
    finally { this.loading.set(false); }
  }
  private details(item: DependencyImportResult): string {
    const chains = item.forwarderChains?.map((chain) => 'Forwarder chain (' + chain.status + '): ' + chain.chain.join(' → ') + (chain.note ? ' · ' + chain.note : '')) ?? [];
    return [item.delayLoad ? 'Delay-load' : undefined, item.source, ...(item.missingSymbols?.length ? ['Missing symbols: ' + item.missingSymbols.join(', ')] : []), ...(item.forwardedSymbols?.length ? ['Forwarded: ' + item.forwardedSymbols.map((value) => value.symbol + ' → ' + value.forwarder).join(', ')] : []), ...chains, item.note].filter(Boolean).join(' · ');
  }
}
