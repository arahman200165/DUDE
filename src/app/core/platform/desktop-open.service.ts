import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PlatformService } from './platform.service';
import { OnboardingService } from './onboarding.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { writeStorageValue } from '../workspace/workspace-storage-bridge';
import { NativeRecentsService } from '../native-recents/native-recents.service';
import type { DesktopOpenItem } from './electron-bridge';

@Injectable({ providedIn: 'root' })
export class DesktopOpenService {
  private readonly platform = inject(PlatformService);
  private readonly onboarding = inject(OnboardingService);
  private readonly registry = inject(ToolRegistryService);
  private readonly nativeRecents = inject(NativeRecentsService);
  private readonly router = inject(Router);
  private readonly pending = signal<readonly DesktopOpenItem[]>([]);
  readonly error = signal('');
  readonly directory = signal<{ path: string; name: string } | null>(null);
  private processing = false;

  constructor() {
    if (!this.platform.isDesktop()) return;
    window.dude!.open.onItem((item) => this.pending.update((items) => [...items, item]));
    window.dude!.open.ready();
    effect(() => {
      if (this.onboarding.initialized() && !this.onboarding.visible() && this.pending().length) void this.flush();
    });
  }

  takeDirectory(): { path: string; name: string } | null {
    const item = this.directory();
    this.directory.set(null);
    return item;
  }

  private async flush(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.pending().length && !this.onboarding.visible()) {
        const item = this.pending()[0];
        this.pending.update((items) => items.slice(1));
        if (item.kind === 'error') { this.error.set(`${item.path}: ${item.message}`); continue; }
        const definition = this.registry.getAll().find((tool) => item.kind === 'directory'
          ? tool.desktopOpen?.directory
          : tool.desktopOpen?.extensions?.includes(item.extension));
        if (!definition) { this.error.set(`No DUDE tool can open ${item.name}.`); continue; }
        if (item.kind === 'directory') this.directory.set({ path: item.path, name: item.name });
        else {
          writeStorageValue(definition.id, definition.desktopOpen!.inputKey!, 'session', item.text);
          if (item.extension === '.html') sessionStorage.setItem('dude:desktop:html-preview-manual', 'true');
          if (item.extension === '.ts') sessionStorage.setItem('dude:desktop:typescript-notice', 'true');
          else if (item.extension === '.js') sessionStorage.removeItem('dude:desktop:typescript-notice');
          this.nativeRecents.record({ path: item.path, name: item.name, extension: item.extension, openedAt: new Date().toISOString() });
        }
        await this.router.navigateByUrl('/', { skipLocationChange: true });
        await this.router.navigateByUrl(definition.route);
      }
    } finally { this.processing = false; }
  }
}
