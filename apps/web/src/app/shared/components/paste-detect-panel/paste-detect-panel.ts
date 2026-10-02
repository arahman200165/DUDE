import { Component, computed, inject, signal } from '@angular/core';
import { PASTE_DETECTORS } from "@dude/tool-engine/core/paste-detect/paste-detectors";
import { detectShapes } from "@dude/tool-engine/core/paste-detect/paste-detect";
import { PasteHandoffService } from '../../../core/paste-detect/paste-handoff.service';
import { TextInputHandoffService } from '../../../core/text-file-input/text-input-handoff.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';

/**
 * Smart Paste's input+match-list core (DUDE_PRD.md §21 Phase 21 Item 3), extracted so both the
 * dedicated `/smart-paste` page and Home's new paste-drop hero (Phase 24 Item 1) share one
 * implementation instead of duplicating the `detectShapes` + `PasteHandoffService.offer` + navigate
 * sequence a second time. Input is a local, never-persisted signal — matches §14.1's sensitive-
 * payload default exactly as the page's own former `'none'`-policy signal did (a `'none'`-policy
 * `PersistenceService.signal` call returns a fresh in-memory signal per call anyway, so this is
 * behaviorally identical, just without the indirection).
 */
@Component({
  selector: 'app-paste-detect-panel',
  templateUrl: './paste-detect-panel.html',
})
export class PasteDetectPanel {
  private readonly registry = inject(ToolRegistryService);
  private readonly handoff = inject(PasteHandoffService);
  private readonly textHandoff = inject(TextInputHandoffService);
  private readonly launcher = inject(ToolLauncherService);

  protected readonly input = signal('');

  /** Public so callers (e.g. Home's compact Smart Entry hero) can decide whether to collapse. */
  readonly hasInput = computed(() => this.input().trim() !== '');

  protected readonly matches = computed(() =>
    detectShapes(this.input(), PASTE_DETECTORS, (id) => this.registry.getById(id)),
  );

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  /** Lets a wrapping idle affordance (e.g. Home's compact Smart Entry hero) forward clipboard
   *  text it captured before this panel existed, so a single paste both expands and populates. */
  receivePaste(text: string): void {
    this.input.set(text);
  }

  clear(): void {
    this.input.set('');
  }

  protected open(toolId: string): void {
    const tool = this.registry.getById(toolId);
    if (!tool) return;

    // Tools that `consume()` take the in-memory hand-off; tools with a declared text input
    // (document formats) get it written straight into that input — see core/text-file-input.
    this.handoff.offer(toolId, this.input());
    this.textHandoff.offer(tool, this.input());
    this.launcher.open(tool);
  }
}
