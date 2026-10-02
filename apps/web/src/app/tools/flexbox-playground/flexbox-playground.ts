import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { CssPreviewSandbox } from '../../shared/components/css-preview-sandbox/css-preview-sandbox';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  DEFAULT_CONTAINER,
  DEFAULT_ITEMS,
  FlexContainerSettings,
  FlexItemSettings,
  buildFlexboxCss,
  buildFlexboxHtml,
} from "@dude/tool-engine/tools/flexbox-playground/flexbox-logic";

const JUSTIFY_OPTIONS = ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'];
const ALIGN_OPTIONS = ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'];
const ALIGN_CONTENT_OPTIONS = ['normal', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'stretch'];
const ALIGN_SELF_OPTIONS = ['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline'];

@Component({
  selector: 'app-flexbox-playground',
  imports: [ToolShell, CopyButton, CssPreviewSandbox],
  templateUrl: './flexbox-playground.html',
})
export class FlexboxPlayground {
  private readonly persistence = inject(PersistenceService);

  protected readonly container = this.persistence.signal<FlexContainerSettings>('flexbox-playground', 'container', 'session', DEFAULT_CONTAINER);
  protected readonly items = this.persistence.signal<readonly FlexItemSettings[]>('flexbox-playground', 'items', 'session', DEFAULT_ITEMS);

  protected readonly justifyOptions = JUSTIFY_OPTIONS;
  protected readonly alignOptions = ALIGN_OPTIONS;
  protected readonly alignContentOptions = ALIGN_CONTENT_OPTIONS;
  protected readonly alignSelfOptions = ALIGN_SELF_OPTIONS;

  protected readonly css = computed(() => buildFlexboxCss(this.container(), this.items()));
  protected readonly html = computed(() => buildFlexboxHtml(this.items()));

  protected readonly previewCss = computed(
    () => `body { margin: 0; padding: 16px; box-sizing: border-box; height: 100vh; background: #1e293b; }
.container { height: 100%; border: 1px dashed rgba(255,255,255,0.25); }
.item { background: #3b82f6; color: white; font: 12px monospace; display: flex; align-items: center; justify-content: center; min-width: 32px; min-height: 32px; padding: 8px; border-radius: 4px; }
${this.css()}`,
  );

  protected updateContainer(patch: Partial<FlexContainerSettings>): void {
    this.container.update((c) => ({ ...c, ...patch }));
  }

  protected onSelect(key: keyof FlexContainerSettings, event: Event): void {
    this.updateContainer({ [key]: (event.target as HTMLSelectElement).value } as Partial<FlexContainerSettings>);
  }

  protected onGapInput(event: Event): void {
    this.updateContainer({ gap: Number((event.target as HTMLInputElement).value) });
  }

  protected addItem(): void {
    this.items.update((items) => [...items, { grow: 0, shrink: 1, basis: 'auto', alignSelf: 'auto' }]);
  }

  protected removeItem(index: number): void {
    this.items.update((items) => items.filter((_, i) => i !== index));
  }

  protected updateItem(index: number, patch: Partial<FlexItemSettings>): void {
    this.items.update((items) => items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  protected onItemNumber(index: number, key: 'grow' | 'shrink', event: Event): void {
    this.updateItem(index, { [key]: Number((event.target as HTMLInputElement).value) } as Partial<FlexItemSettings>);
  }

  protected onItemText(index: number, key: 'basis' | 'alignSelf', event: Event): void {
    this.updateItem(index, { [key]: (event.target as HTMLInputElement | HTMLSelectElement).value } as Partial<FlexItemSettings>);
  }
}
