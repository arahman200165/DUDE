import { Component, inject, signal } from '@angular/core';
import { ShellChromeService } from '../../../core/platform/shell-chrome.service';
import { NativeRecentsService } from '../../../core/native-recents/native-recents.service';
import type { FileAssociations } from '../../../core/platform/electron-bridge';

/** Settings › Files (desktop-only): installer file-association candidates and the native recents list. */
@Component({
  selector: 'app-files-settings',
  templateUrl: './files-settings.html',
})
export class FilesSettings {
  private readonly shellChrome = inject(ShellChromeService);
  protected readonly nativeRecents = inject(NativeRecentsService);
  protected readonly fileAssociations = signal<FileAssociations | null>(null);
  protected readonly message = signal('');

  constructor() {
    void this.shellChrome.getFileAssociations().then((associations) => this.fileAssociations.set(associations));
  }

  protected async openWindowsDefaultApps(): Promise<void> {
    const result = await this.shellChrome.openDefaultApps();
    this.message.set(result.ok ? 'Opened Windows Default Apps.' : result.error);
  }

  protected onNativeRecentsEnabledToggle(event: Event): void {
    this.nativeRecents.enabled.set((event.target as HTMLInputElement).checked);
  }
}
