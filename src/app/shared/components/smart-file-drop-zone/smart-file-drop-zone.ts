import { Component, computed, inject, signal } from '@angular/core';
import { FileDrop } from '../file-drop/file-drop';
import { FileDropCandidatePicker } from '../file-drop-candidate-picker/file-drop-candidate-picker';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { FileDropDeliveryService } from '../../../core/file-drop-detect/file-drop-delivery.service';
import { FILE_DROP_DETECTORS } from '../../../core/file-drop-detect/file-drop-detectors';
import { detectFileDrop } from '../../../core/file-drop-detect/file-drop-detect';
import { FileDropMatch } from '../../../core/file-drop-detect/file-drop-detectors.model';

/**
 * Smart File Drop's UI half (DUDE_PRD.md §21 Phase 24 Item 4) — wraps the existing generic
 * `app-file-drop` primitive (never a rewrite of its drag/drop mechanics), reads the dropped file's
 * header bytes, ranks candidate tools via `detectFileDrop`, and hands the actual `File` off to
 * whichever candidate the user picks. Ships on both desktop and web: nothing here touches
 * `window.dude.fs.*`, only the standard `File`/`Blob` API, which works identically in a browser tab.
 */
@Component({
  selector: 'app-smart-file-drop-zone',
  imports: [FileDrop, FileDropCandidatePicker],
  templateUrl: './smart-file-drop-zone.html',
})
export class SmartFileDropZone {
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly delivery = inject(FileDropDeliveryService);

  protected readonly droppedFileName = signal<string | null>(null);
  protected readonly matches = signal<readonly FileDropMatch[] | null>(null);
  protected readonly error = signal<string | null>(null);
  private droppedFile: File | null = null;

  /** Public so callers (e.g. Home's compact Smart Entry hero) can decide whether to collapse. */
  readonly hasFile = computed(() => this.droppedFileName() !== null);

  protected async onFileSelected(file: File): Promise<void> {
    this.droppedFile = file;
    this.droppedFileName.set(file.name);
    this.matches.set(null);
    this.error.set(null);

    const matches = await detectFileDrop(file, this.registry.getAll(), FILE_DROP_DETECTORS, (id) => this.registry.getById(id));

    // The user may have cleared the drop (or dropped a second file) before this async detection
    // resolved -- don't resurrect a stale result for a file that's no longer the current one.
    if (this.droppedFile === file) this.matches.set(matches);
  }

  protected async open(toolId: string): Promise<void> {
    const tool = this.registry.getById(toolId);
    const file = this.droppedFile;
    if (!tool || !file) return;

    const error = await this.delivery.deliver(tool, file);
    if (file !== this.droppedFile) return;
    if (error) {
      this.error.set(error);
      return;
    }
    this.launcher.open(tool);
    this.clear();
  }

  clear(): void {
    this.droppedFile = null;
    this.droppedFileName.set(null);
    this.matches.set(null);
    this.error.set(null);
  }
}
