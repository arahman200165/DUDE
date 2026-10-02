import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { CssPreviewSandbox } from '../../shared/components/css-preview-sandbox/css-preview-sandbox';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  AnimationSettings,
  DEFAULT_ANIMATION_SETTINGS,
  DEFAULT_STOPS,
  KeyframeStop,
  buildAnimationDeclaration,
  buildFullCss,
  buildKeyframesBlock,
} from "@dude/tool-engine/tools/css-animation-builder/css-animation-logic";

const PREVIEW_HTML = '<div class="animated"></div>';
const TIMING_FUNCTIONS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];
const DIRECTIONS = ['normal', 'reverse', 'alternate', 'alternate-reverse'];

@Component({
  selector: 'app-css-animation-builder',
  imports: [ToolShell, CopyButton, CssPreviewSandbox],
  templateUrl: './css-animation-builder.html',
})
export class CssAnimationBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly settings = this.persistence.signal<AnimationSettings>(
    'css-animation-builder',
    'settings',
    'session',
    DEFAULT_ANIMATION_SETTINGS,
  );
  protected readonly stops = this.persistence.signal<readonly KeyframeStop[]>('css-animation-builder', 'stops', 'session', DEFAULT_STOPS);

  protected readonly timingFunctions = TIMING_FUNCTIONS;
  protected readonly directions = DIRECTIONS;

  protected readonly css = computed(() => buildFullCss(this.settings(), this.stops()));

  protected readonly previewCss = computed(() => {
    const s = this.settings();
    return `body { margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center; background: #1e293b; }
${buildKeyframesBlock(s.name, this.stops())}
.animated { width: 80px; height: 80px; border-radius: 8px; background: #3b82f6; ${buildAnimationDeclaration(s)} }`;
  });
  protected readonly previewHtml = PREVIEW_HTML;

  protected updateSettings(patch: Partial<AnimationSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
  }

  protected onTextInput(key: 'name' | 'timingFunction' | 'iterationCount' | 'direction', event: Event): void {
    this.updateSettings({ [key]: (event.target as HTMLInputElement | HTMLSelectElement).value } as Partial<AnimationSettings>);
  }

  protected onNumberInput(key: 'durationSeconds' | 'delaySeconds', event: Event): void {
    this.updateSettings({ [key]: Number((event.target as HTMLInputElement).value) } as Partial<AnimationSettings>);
  }

  protected addStop(): void {
    this.stops.update((stops) => [...stops, { percent: 100, declarations: '' }]);
  }

  protected removeStop(index: number): void {
    this.stops.update((stops) => stops.filter((_, i) => i !== index));
  }

  protected updateStop(index: number, patch: Partial<KeyframeStop>): void {
    this.stops.update((stops) => stops.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  protected onStopPercent(index: number, event: Event): void {
    this.updateStop(index, { percent: Number((event.target as HTMLInputElement).value) });
  }

  protected onStopDeclarations(index: number, event: Event): void {
    this.updateStop(index, { declarations: (event.target as HTMLTextAreaElement).value });
  }
}
