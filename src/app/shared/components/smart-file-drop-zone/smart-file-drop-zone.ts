import { Component, inject, signal } from '@angular/core';
import { FileDrop } from '../file-drop/file-drop';
import { FileDropCandidatePicker } from '../file-drop-candidate-picker/file-drop-candidate-picker';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { FileDropHandoffService } from '../../../core/file-drop-detect/file-drop-handoff.service';
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
  private readonly handoff = inject(FileDropHandoffService);

  protected readonly droppedFileName = signal<string | null>(null);
  protected readonly matches = signal<readonly FileDropMatch[] | null>(null);
  private droppedFile: File | null = null;

  protected async onFileSelected(file: File): Promise<void> {
    this.droppedFile = file;
    this.droppedFileName.set(file.name);
    this.matches.set(null);

    const matches = await detectFileDrop(file, this.registry.getAll(), FILE_DROP_DETECTORS, (id) => this.registry.getById(id));

    // The user may have cleared the drop (or dropped a second file) before this async detection
    // resolved -- don't resurrect a stale result for a file that's no longer the current one.
    if (this.droppedFile === file) this.matches.set(matches);
  }

  protected open(toolId: string): void {
    const tool = this.registry.getById(toolId);
    if (!tool || !this.droppedFile) return;

    this.handoff.offer(toolId, this.droppedFile);
    this.launcher.open(tool);
    this.clear();
  }

  protected clear(): void {
    this.droppedFile = null;
    this.droppedFileName.set(null);
    this.matches.set(null);
  }
}
