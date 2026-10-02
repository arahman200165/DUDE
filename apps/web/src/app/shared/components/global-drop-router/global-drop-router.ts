import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from '../../../core/platform/platform-bridge.adapter';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { PlatformService } from '../../../core/platform/platform.service';
import { QuickLauncherService } from '../../../core/platform/quick-launcher.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { FileDropDeliveryService } from '../../../core/file-drop-detect/file-drop-delivery.service';
import { FILE_DROP_DETECTORS } from "@dude/tool-engine/core/file-drop-detect/file-drop-detectors";
import { detectFileDrop } from "@dude/tool-engine/core/file-drop-detect/file-drop-detect";
import { FileDropMatch } from "@dude/domain/core/file-drop-detect/file-drop-detectors.model";
import { FileDropCandidatePicker } from '../file-drop-candidate-picker/file-drop-candidate-picker';

/** Elements that handle a dropped file themselves -- the window-level router must stand aside. */
export const LOCAL_FILE_DROP_TARGETS = 'app-file-drop, [data-dude-file-drop]';

/** Only a dominant format match opens automatically; generic fallbacks still need a choice. */
export function confidentFileDropMatch(matches: readonly FileDropMatch[]): FileDropMatch | null {
  const [first, second] = matches;
  return first && first.score >= 0.8 && (!second || first.score - second.score >= 0.15) ? first : null;
}

@Component({
  selector: 'app-global-drop-router',
  imports: [FileDropCandidatePicker],
  templateUrl: './global-drop-router.html',
})
export class GlobalDropRouter implements OnDestroy {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly platform = inject(PlatformService);
  private readonly quickLauncher = inject(QuickLauncherService);
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly delivery = inject(FileDropDeliveryService);
  readonly dragging = signal(false);
  readonly message = signal('');
  readonly candidateFile = signal<File | null>(null);
  readonly candidateMatches = signal<readonly FileDropMatch[]>([]);
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
    // Existing app-file-drop widgets and text inputs carrying the shared `appTextFileDrop`
    // directive own their own file input and handoff flow.
    if (event.target instanceof Element && event.target.closest(LOCAL_FILE_DROP_TARGETS)) return;
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      this.message.set('Drop one file or folder at a time.');
      return;
    }
    const file = files[0];
    const directory = event.dataTransfer.items?.[0]?.webkitGetAsEntry()?.isDirectory ?? false;
    if (directory) void this.routeDirectory(file);
    else void this.routeFile(file);
  };

  private async routeDirectory(file: File): Promise<void> {
    const sequence = ++this.sequence;
    this.candidateFile.set(null);
    this.candidateMatches.set([]);
    try {
      const path = this.platformBridgePort.get()!.open.getPathForFile(file);
      if (!path) { this.message.set('Could not read the dropped folder path.'); return; }
      await this.quickLauncher.promote();
      if (sequence !== this.sequence) return;
      const result = await this.platformBridgePort.get()!.open.enqueuePath(path);
      if (sequence !== this.sequence) return;
      this.message.set(result.ok ? '' : 'Could not open this folder.');
    } catch {
      if (sequence === this.sequence) this.message.set('Could not open this folder.');
    }
  }

  private async routeFile(file: File): Promise<void> {
    const sequence = ++this.sequence;
    this.candidateFile.set(null);
    this.candidateMatches.set([]);
    this.message.set('');
    try {
      const matches = await detectFileDrop(file, this.registry.getAll(), FILE_DROP_DETECTORS, (id) => this.registry.getById(id));
      if (sequence !== this.sequence) return;
      if (!matches.length) { this.message.set('No matching tool found for this file.'); return; }
      this.candidateFile.set(file);
      this.candidateMatches.set(matches);
      const match = confidentFileDropMatch(matches);
      if (match) await this.openCandidate(match.toolId);
    } catch {
      if (sequence === this.sequence) this.message.set('Could not inspect this file.');
    }
  }

  async openCandidate(toolId: string): Promise<void> {
    const file = this.candidateFile();
    if (!file || !this.candidateMatches().some((match) => match.toolId === toolId)) return;
    const tool = this.registry.getById(toolId);
    if (!tool) { this.message.set('The matching tool is unavailable.'); return; }
    await this.quickLauncher.promote();
    if (file !== this.candidateFile()) return;
    const error = await this.delivery.deliver(tool, file);
    if (file !== this.candidateFile()) return;
    if (error) { this.message.set(error); this.clearCandidates(); return; }
    this.launcher.open(tool);
    this.clearCandidates();
  }

  clearCandidates(): void {
    ++this.sequence;
    this.candidateFile.set(null);
    this.candidateMatches.set([]);
  }
}
