import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PlatformService } from './platform.service';
import { OnboardingService } from './onboarding.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { writeStorageValue } from '../workspace/workspace-storage-bridge';
import { NativeRecentsService } from '../native-recents/native-recents.service';
import { recordImportedFileFlags } from '../text-file-input/imported-file-flags';
import type { DesktopOpenItem, VoidResult } from "@dude/contracts/shared/models/platform-bridge.model";

@Injectable({ providedIn: 'root' })
export class DesktopOpenService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

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
    this.platformBridgePort.get()!.open.onItem((item) => this.pending.update((items) => [...items, item]));
    this.platformBridgePort.get()!.open.ready();
    effect(() => {
      if (this.onboarding.initialized() && !this.onboarding.visible() && this.pending().length) void this.flush();
    });
  }

  takeDirectory(): { path: string; name: string } | null {
    const item = this.directory();
    this.directory.set(null);
    return item;
  }

  /** Native File Recent List "reopen" (DUDE_PRD.md §21 Phase 25 Item 5) -- re-resolves the file from
   *  disk through the same bounded path a fresh Explorer-association open already takes; the result
   *  arrives back through the ordinary `onItem` queue this service already flushes, never a cached
   *  snapshot. */
  async reopen(path: string): Promise<VoidResult> {
    if (!this.platform.isDesktop()) return { ok: false, error: 'not-supported' };
    return this.platformBridgePort.get()!.open.reopen(path);
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
          recordImportedFileFlags(item.name);
          this.nativeRecents.record({ path: item.path, name: item.name, extension: item.extension, openedAt: new Date().toISOString() });
        }
        await this.router.navigateByUrl('/', { skipLocationChange: true });
        await this.router.navigateByUrl(definition.route);
      }
    } finally { this.processing = false; }
  }
}
