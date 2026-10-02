import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from '../../../core/platform/platform-bridge.adapter';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PasteDetectionMatch } from "@dude/domain/shared/models/paste-detector.model";
import { PASTE_DETECTORS } from "@dude/tool-engine/core/paste-detect/paste-detectors";
import { detectAmbientMatch, isEditablePasteTarget } from '../../../core/paste-detect/ambient-paste';
import { PasteHandoffService } from '../../../core/paste-detect/paste-handoff.service';
import { TextInputHandoffService } from '../../../core/text-file-input/text-input-handoff.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { PlatformService } from '../../../core/platform/platform.service';

/**
 * Ambient Smart Paste (DUDE_PRD.md §21 Phase 24 Item 2) — a global `paste` listener mounted once by
 * `ShellLayout`, picking up a shape match without requiring navigation to `/smart-paste`. Reuses
 * `PASTE_DETECTORS`/`detectShapes` unmodified via `detectAmbientMatch` (a stricter confidence floor,
 * see `core/paste-detect/ambient-paste.ts`) — this was the "ambient/global paste capture... deliberately
 * deferred" note from the original Phase 21 Item 3 amendment, now picked back up as a second,
 * independent consumer of the same detection machinery. Mounted globally (not gated to Home), it
 * can render while a Workspace panel is active, so opening a match goes through `ToolLauncherService`
 * rather than a plain route navigation.
 *
 * On desktop, this is also where the Desktop Global Smart Paste Hotkey (Item 3) surfaces its result
 * — `apps/desktop/smart-paste-hotkey.ts` only ever focuses the window and hands over raw clipboard
 * text; classification stays entirely renderer-side, reusing this exact same evaluation path.
 */
@Component({
  selector: 'app-ambient-paste-chip',
  templateUrl: './ambient-paste-chip.html',
})
export class AmbientPasteChip {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly registry = inject(ToolRegistryService);
  private readonly handoff = inject(PasteHandoffService);
  private readonly textHandoff = inject(TextInputHandoffService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly router = inject(Router);
  private readonly platform = inject(PlatformService);

  protected readonly match = signal<PasteDetectionMatch | null>(null);
  private lastText = '';

  constructor() {
    const listener = (event: ClipboardEvent) => this.onPaste(event);
    document.addEventListener('paste', listener);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('paste', listener));

    if (this.platform.isDesktop()) {
      const unsubscribe = this.platformBridgePort.get()!.smartPaste.onTrigger((text) => this.evaluate(text));
      inject(DestroyRef).onDestroy(unsubscribe);
      this.platformBridgePort.get()!.smartPaste.ready();
    }
  }

  private onPaste(event: ClipboardEvent): void {
    // A paste already landing in a text field has an obvious destination -- never nag there, and
    // never double up with the dedicated page's own detection while already on it.
    if (isEditablePasteTarget(event.target) || this.router.url.startsWith('/smart-paste')) return;

    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text.trim()) {
      this.match.set(null);
      return;
    }

    this.evaluate(text);
  }

  private evaluate(text: string): void {
    if (!text.trim()) return;
    const best = detectAmbientMatch(text, PASTE_DETECTORS, (id) => this.registry.getById(id));
    this.lastText = text;
    this.match.set(best);
  }

  protected open(): void {
    const match = this.match();
    if (!match) return;

    const tool = this.registry.getById(match.toolId);
    if (!tool) return;

    this.handoff.offer(match.toolId, this.lastText);
    this.textHandoff.offer(tool, this.lastText);
    this.launcher.open(tool);
    this.match.set(null);
  }

  protected dismiss(): void {
    this.match.set(null);
  }
}
