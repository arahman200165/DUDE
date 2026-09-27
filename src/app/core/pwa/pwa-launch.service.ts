import { Injectable, inject, signal } from '@angular/core';
import { PlatformService } from '../platform/platform.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { ToolLauncherService } from '../registry/tool-launcher.service';
import { TextInputHandoffService } from '../text-file-input/text-input-handoff.service';

interface LaunchParams {
  readonly files?: readonly FileSystemFileHandle[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void | Promise<void>): void;
}

const MAX_OPENED_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Installed-PWA "Open with DUDE" (DUDE_PRD.md §21 Phase 26 Item 9), the web twin of desktop
 * Explorer file associations. The generated manifest's `file_handlers` list exactly the
 * extensions tools claim through `desktopOpen`. A launched file goes through the same
 * extension → tool mapping and `TextInputHandoffService` prefill as a desktop "Open with", so it
 * lands in the tool's own declared persistence policy and is flagged as imported. Nothing runs by
 * itself. Inert outside an installed Chromium PWA.
 */
@Injectable({ providedIn: 'root' })
export class PwaLaunchService {
  private readonly platform = inject(PlatformService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly handoff = inject(TextInputHandoffService);

  readonly error = signal('');

  constructor() {
    const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
    if (this.platform.isDesktop() || !queue) return;
    queue.setConsumer((params) => this.open(params));
  }

  async open(params: LaunchParams): Promise<void> {
    const handle = params.files?.[0];
    if (!handle) return;
    const file = await handle.getFile();
    const dot = file.name.lastIndexOf('.');
    const extension = dot < 0 ? '' : file.name.slice(dot).toLowerCase();
    const tool = this.registry.getAll().find((candidate) => candidate.desktopOpen?.extensions?.includes(extension));
    if (!tool) {
      this.error.set(`DUDE has no tool that opens ${extension || 'this kind of'} file.`);
      return;
    }
    if (file.size > MAX_OPENED_FILE_BYTES) {
      this.error.set(`${file.name} is too large to open here (limit 10 MB).`);
      return;
    }
    if (!this.handoff.offer(tool, await file.text(), file.name)) {
      this.error.set(`${tool.title} can't open files directly.`);
      return;
    }
    this.launcher.open(tool);
  }
}
