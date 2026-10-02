import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { CssPreviewSandbox } from '../../shared/components/css-preview-sandbox/css-preview-sandbox';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  DEFAULT_GRID_CONTAINER,
  DEFAULT_GRID_ITEMS,
  GridContainerSettings,
  GridItemSettings,
  buildGridCss,
  buildGridHtml,
} from "@dude/tool-engine/tools/css-grid-playground/css-grid-logic";

const JUSTIFY_ALIGN_OPTIONS = ['stretch', 'start', 'end', 'center'];

@Component({
  selector: 'app-css-grid-playground',
  imports: [ToolShell, CopyButton, CssPreviewSandbox],
  templateUrl: './css-grid-playground.html',
})
export class CssGridPlayground {
  private readonly persistence = inject(PersistenceService);

  protected readonly container = this.persistence.signal<GridContainerSettings>('css-grid-playground', 'container', 'session', DEFAULT_GRID_CONTAINER);
  protected readonly items = this.persistence.signal<readonly GridItemSettings[]>('css-grid-playground', 'items', 'session', DEFAULT_GRID_ITEMS);

  protected readonly justifyAlignOptions = JUSTIFY_ALIGN_OPTIONS;

  protected readonly css = computed(() => buildGridCss(this.container(), this.items()));
  protected readonly html = computed(() => buildGridHtml(this.items()));

  protected readonly previewCss = computed(
    () => `body { margin: 0; padding: 16px; box-sizing: border-box; height: 100vh; background: #1e293b; }
.grid { height: 100%; border: 1px dashed rgba(255,255,255,0.25); }
.item { background: #3b82f6; color: white; font: 12px monospace; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
${this.css()}`,
  );

  protected updateContainer(patch: Partial<GridContainerSettings>): void {
    this.container.update((c) => ({ ...c, ...patch }));
  }

  protected onTextInput(key: 'columns' | 'rows', event: Event): void {
    this.updateContainer({ [key]: (event.target as HTMLInputElement).value } as Partial<GridContainerSettings>);
  }

  protected onGapInput(key: 'columnGap' | 'rowGap', event: Event): void {
    this.updateContainer({ [key]: Number((event.target as HTMLInputElement).value) } as Partial<GridContainerSettings>);
  }

  protected onSelect(key: 'justifyItems' | 'alignItems', event: Event): void {
    this.updateContainer({ [key]: (event.target as HTMLSelectElement).value } as Partial<GridContainerSettings>);
  }

  protected addItem(): void {
    this.items.update((items) => [...items, { gridColumn: 'auto', gridRow: 'auto' }]);
  }

  protected removeItem(index: number): void {
    this.items.update((items) => items.filter((_, i) => i !== index));
  }

  protected onItemInput(index: number, key: keyof GridItemSettings, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.items.update((items) => items.map((it, i) => (i === index ? { ...it, [key]: value } : it)));
  }
}
