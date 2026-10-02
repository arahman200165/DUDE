import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { CssPreviewSandbox } from '../../shared/components/css-preview-sandbox/css-preview-sandbox';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { BorderRadiusCorners, BorderRadiusUnit, DEFAULT_CORNERS, buildBorderRadiusDeclaration } from "@dude/tool-engine/tools/border-radius-generator/border-radius-logic";

const PREVIEW_HTML = '<div class="box"></div>';

@Component({
  selector: 'app-border-radius-generator',
  imports: [ToolShell, CopyButton, CssPreviewSandbox],
  templateUrl: './border-radius-generator.html',
})
export class BorderRadiusGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly corners = this.persistence.signal<BorderRadiusCorners>('border-radius-generator', 'corners', 'session', DEFAULT_CORNERS);
  protected readonly unit = this.persistence.signal<BorderRadiusUnit>('border-radius-generator', 'unit', 'local', 'px');
  protected readonly linked = this.persistence.signal('border-radius-generator', 'linked', 'local', true);

  protected readonly declaration = computed(() => buildBorderRadiusDeclaration(this.corners(), this.unit()));

  protected readonly previewCss = computed(
    () => `body { display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1e293b; }
.box { width: 140px; height: 140px; background: #3b82f6; ${this.declaration()} }`,
  );

  protected readonly previewHtml = PREVIEW_HTML;

  protected onCornerInput(key: keyof BorderRadiusCorners, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (this.linked()) {
      this.corners.set({ topLeft: value, topRight: value, bottomRight: value, bottomLeft: value });
    } else {
      this.corners.update((c) => ({ ...c, [key]: value }));
    }
  }

  protected setUnit(unit: BorderRadiusUnit): void {
    this.unit.set(unit);
  }

  protected toggleLinked(event: Event): void {
    this.linked.set((event.target as HTMLInputElement).checked);
  }
}
