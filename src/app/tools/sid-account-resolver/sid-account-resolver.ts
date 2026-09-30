import { Component, computed, inject, signal } from '@angular/core';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import type { SysMethodMap, SysReadMethod } from '../../../shared-logic/system/system-types';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { decodeSid } from '../../../shared-logic/system/sid';
import { downloadFile } from '../../shared/utils/download-file';

type View = 'resolve' | 'token' | 'accounts' | 'profiles' | 'groups' | 'well-known';

@Component({
  selector: 'app-sid-account-resolver',
  imports: [ToolShell, StatusGlyph, CopyButton, DesktopOnlyControl],
  templateUrl: './sid-account-resolver.html',
})
export class SidAccountResolverTool {
  protected readonly platform = inject(PlatformService);
  private readonly system = inject(SystemInfoService);
  protected readonly view = signal<View>('resolve');
  protected readonly input = signal('');
  protected readonly inputFormat = signal<'sid' | 'binary-base64' | 'binary-hex'>('sid');
  protected readonly name = signal('');
  protected readonly data = signal<unknown>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected readonly outputText = computed(() => this.data() === null ? '' : JSON.stringify(this.data(), null, 2));

  /** Pure client-side decode: works on the web companion and without invoking the helper. */
  protected resolve(): void {
    const value = this.input().trim();
    if (!value) return;

    this.error.set('');
    try {
      this.data.set(decodeSid(value, this.inputFormat()));
      this.view.set('resolve');
    } catch (caught) {
      this.data.set(null);
      this.error.set(caught instanceof Error ? caught.message : String(caught));
    }
  }

  protected async lookupSid(): Promise<void> {
    const value = this.input().trim();
    if (value && this.inputFormat() === 'sid') await this.run('resolve', 'sid.lookup', { query: value, lookupKind: 'sid' });
  }

  protected async lookupName(): Promise<void> {
    const value = this.name().trim();
    if (!value) return;

    await this.run('resolve', 'sid.lookup', { query: value, lookupKind: 'account' });
  }

  protected async load(view: Exclude<View, 'resolve' | 'groups'>): Promise<void> {
    if (view === 'token') await this.run(view, 'account.token', {});
    else if (view === 'accounts') await this.run(view, 'account.localAccounts', {});
    else await this.run(view, 'account.profiles', {});
  }

  protected async loadGroups(): Promise<void> { await this.run('groups', 'account.localGroups', {}); }

  protected async loadWellKnown(): Promise<void> { await this.run('well-known', 'sid.wellKnown', {}); }

  protected async run<M extends SysReadMethod>(view: View, method: M, params: SysMethodMap[M]['params']): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    this.data.set(null);
    try {
      const result = await this.system.call(method, params);
      this.view.set(view);
      this.data.set(result);
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : String(caught));
    } finally {
      this.loading.set(false);
    }
  }

  protected exportJson(): void {
    if (this.data() === null) return;
    downloadFile(new Blob([this.outputText()], { type: 'application/json' }), `sid-account-${this.view()}.json`, 'application/json');
  }
}