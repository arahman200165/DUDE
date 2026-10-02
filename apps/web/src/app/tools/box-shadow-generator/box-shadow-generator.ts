import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { CssPreviewSandbox } from '../../shared/components/css-preview-sandbox/css-preview-sandbox';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { DEFAULT_SHADOW_LAYER, ShadowLayer, buildBoxShadowDeclaration, buildBoxShadowValue } from "@dude/tool-engine/tools/box-shadow-generator/box-shadow-logic";

const PREVIEW_HTML = '<div class="box"></div>';

@Component({
  selector: 'app-box-shadow-generator',
  imports: [ToolShell, CopyButton, CssPreviewSandbox],
  templateUrl: './box-shadow-generator.html',
})
export class BoxShadowGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly layers = this.persistence.signal<readonly ShadowLayer[]>('box-shadow-generator', 'layers', 'session', [
    DEFAULT_SHADOW_LAYER,
  ]);

  protected readonly declaration = computed(() => buildBoxShadowDeclaration(this.layers()));

  protected readonly previewCss = computed(
    () => `body { display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1e293b; }
.box { width: 120px; height: 120px; background: #3b82f6; border-radius: 8px; ${buildBoxShadowDeclaration(this.layers())} }`,
  );

  protected readonly previewHtml = PREVIEW_HTML;

  protected addLayer(): void {
    this.layers.update((layers) => [...layers, DEFAULT_SHADOW_LAYER]);
  }

  protected removeLayer(index: number): void {
    this.layers.update((layers) => layers.filter((_, i) => i !== index));
  }

  protected updateLayer(index: number, patch: Partial<ShadowLayer>): void {
    this.layers.update((layers) => layers.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)));
  }

  protected numberInput(index: number, key: keyof ShadowLayer, event: Event): void {
    this.updateLayer(index, { [key]: Number((event.target as HTMLInputElement).value) } as Partial<ShadowLayer>);
  }

  protected colorInput(index: number, event: Event): void {
    this.updateLayer(index, { color: (event.target as HTMLInputElement).value });
  }

  protected insetToggle(index: number, event: Event): void {
    this.updateLayer(index, { inset: (event.target as HTMLInputElement).checked });
  }

  protected readonly buildBoxShadowValue = buildBoxShadowValue;
}
