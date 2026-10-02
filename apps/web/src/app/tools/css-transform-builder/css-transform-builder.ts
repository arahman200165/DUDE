import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { CssPreviewSandbox } from '../../shared/components/css-preview-sandbox/css-preview-sandbox';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { DEFAULT_TRANSFORM_STATE, ORIGIN_PRESETS, TransformState, buildTransformDeclaration } from "@dude/tool-engine/tools/css-transform-builder/css-transform-logic";

const PREVIEW_HTML = '<div class="ghost"></div><div class="box"></div>';

@Component({
  selector: 'app-css-transform-builder',
  imports: [ToolShell, CopyButton, CssPreviewSandbox],
  templateUrl: './css-transform-builder.html',
})
export class CssTransformBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly state = this.persistence.signal<TransformState>('css-transform-builder', 'state', 'session', DEFAULT_TRANSFORM_STATE);
  protected readonly origins = ORIGIN_PRESETS;

  protected readonly declaration = computed(() => buildTransformDeclaration(this.state()));

  protected readonly previewCss = computed(
    () => `body { margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center; background: #1e293b; position: relative; }
.ghost { position: absolute; width: 100px; height: 100px; border: 1px dashed rgba(255,255,255,0.25); }
.box { width: 100px; height: 100px; background: #3b82f6; ${this.declaration()} }`,
  );
  protected readonly previewHtml = PREVIEW_HTML;

  protected onNumberInput(key: keyof Omit<TransformState, 'origin'>, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.state.update((s) => ({ ...s, [key]: value }));
  }

  protected setOrigin(origin: string): void {
    this.state.update((s) => ({ ...s, origin }));
  }

  protected reset(): void {
    this.state.set(DEFAULT_TRANSFORM_STATE);
  }
}
