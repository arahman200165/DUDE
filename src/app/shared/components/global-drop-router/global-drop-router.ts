import { Component, OnDestroy, inject, signal } from '@angular/core';
import { PlatformService } from '../../../core/platform/platform.service';
import { QuickLauncherService } from '../../../core/platform/quick-launcher.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { FileDropHandoffService } from '../../../core/file-drop-detect/file-drop-handoff.service';
import { FILE_DROP_DETECTORS } from '../../../core/file-drop-detect/file-drop-detectors';
import { detectFileDrop } from '../../../core/file-drop-detect/file-drop-detect';
import { FileDropMatch } from '../../../core/file-drop-detect/file-drop-detectors.model';

/** Only a dominant format match opens automatically; generic fallbacks still need a choice. */
export function confidentFileDropMatch(matches: readonly FileDropMatch[]): FileDropMatch | null {
  const [first, second] = matches;
  return first && first.score >= 0.8 && (!second || first.score - second.score >= 0.15) ? first : null;
}

@Component({
  selector: 'app-global-drop-router',
  templateUrl: './global-drop-router.html',
})
export class GlobalDropRouter implements OnDestroy {
  private readonly platform = inject(PlatformService);
  private readonly quickLauncher = inject(QuickLauncherService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly handoff = inject(FileDropHandoffService);
  readonly dragging = signal(false);
  readonly message = signal('');
  private sequence = 0;

  constructor() {
    if (!this.platform.isDesktop()) return;
    window.addEventListener('dragover', this.onDragOver, true);
    window.addEventListener('dragleave', this.onDragLeave, true);
    window.addEventListener('drop', this.onDrop, true);
  }

  ngOnDestroy(): void {
    if (!this.platform.isDesktop()) return;
    window.removeEventListener('dragover', this.onDragOver, true);
    window.removeEventListener('dragleave', this.onDragLeave, true);
    window.removeEventListener('drop', this.onDrop, true);
  }

  private readonly onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  };

  private readonly onDragLeave = (event: DragEvent): void => {
    if (event.relatedTarget === null) this.dragging.set(false);
  };

  private readonly onDrop = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(false);
    // Existing app-file-drop widgets own their own file input and handoff flow.
    if (event.target instanceof Element && event.target.closest('app-file-drop')) return;
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      this.message.set('Drop one file at a time.');
      return;
    }
    void this.routeFile(files[0]);
  };

  private async routeFile(file: File): Promise<void> {
    const sequence = ++this.sequence;
    this.message.set('');
    try {
      const matches = await detectFileDrop(file, this.registry.getAll(), FILE_DROP_DETECTORS, (id) => this.registry.getById(id));
      if (sequence !== this.sequence) return;
      if (!matches.length) { this.message.set('No matching tool found for this file.'); return; }
      const match = confidentFileDropMatch(matches);
      if (!match) { this.message.set('Several tools match this file. Drop it on Home to choose.'); return; }
      const tool = this.registry.getById(match.toolId);
      if (!tool) { this.message.set('The matching tool is unavailable.'); return; }
      await this.quickLauncher.promote();
      this.handoff.offer(tool.id, file);
      this.launcher.open(tool);
    } catch {
      if (sequence === this.sequence) this.message.set('Could not inspect this file.');
    }
  }
}
