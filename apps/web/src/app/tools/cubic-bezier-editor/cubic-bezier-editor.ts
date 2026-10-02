import { SVG_SIZE, Y_MIN, Y_RANGE, CubicBezierEditor_toSvgX, CubicBezierEditor_toSvgY } from "@dude/tool-engine/tools/cubic-bezier-editor/cubic-bezier-editor.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { CssPreviewSandbox } from '../../shared/components/css-preview-sandbox/css-preview-sandbox';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { BEZIER_PRESETS, BezierPoints, buildCubicBezierValue, validateBezierPoints } from "@dude/tool-engine/tools/cubic-bezier-editor/cubic-bezier-logic";

const PREVIEW_HTML = '<div class="track"><div class="ball"></div></div>';




@Component({
  selector: 'app-cubic-bezier-editor',
  imports: [ToolShell, CopyButton, CssPreviewSandbox],
  templateUrl: './cubic-bezier-editor.html',
})
export class CubicBezierEditor {
  private readonly persistence = inject(PersistenceService);

  protected readonly points = this.persistence.signal<BezierPoints>('cubic-bezier-editor', 'points', 'session', BEZIER_PRESETS[0].points);
  protected readonly presets = BEZIER_PRESETS;
  protected readonly svgSize = SVG_SIZE;

  protected readonly validation = computed(() => validateBezierPoints(this.points()));
  protected readonly value = computed(() => buildCubicBezierValue(this.points()));

  protected readonly previewCss = computed(
    () => `body { margin: 0; height: 100vh; display: flex; align-items: center; background: #1e293b; }
.track { width: 100%; padding: 0 24px; box-sizing: border-box; }
.ball { width: 28px; height: 28px; border-radius: 50%; background: #3b82f6; animation: slide 1.8s ${this.value()} infinite alternate; }
@keyframes slide { from { transform: translateX(0); } to { transform: translateX(calc(100vw - 96px)); } }`,
  );
  protected readonly previewHtml = PREVIEW_HTML;
  protected toSvgX = CubicBezierEditor_toSvgX;

  protected toSvgY = CubicBezierEditor_toSvgY;


  private fromSvg(event: PointerEvent, svg: Element): { x: number; y: number } {
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * SVG_SIZE;
    const py = ((event.clientY - rect.top) / rect.height) * SVG_SIZE;
    const x = Math.round((px / SVG_SIZE) * 100) / 100;
    const y = Math.round((Y_MIN + (1 - py / SVG_SIZE) * Y_RANGE) * 100) / 100;
    return { x, y };
  }

  protected startDrag(event: PointerEvent): void {
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  protected dragP1(event: PointerEvent, svg: Element): void {
    if (event.buttons === 0) return;
    const { x, y } = this.fromSvg(event, svg);
    this.points.update((p) => ({ ...p, x1: Math.min(1, Math.max(0, x)), y1: y }));
  }

  protected dragP2(event: PointerEvent, svg: Element): void {
    if (event.buttons === 0) return;
    const { x, y } = this.fromSvg(event, svg);
    this.points.update((p) => ({ ...p, x2: Math.min(1, Math.max(0, x)), y2: y }));
  }

  protected onNumberInput(key: keyof BezierPoints, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.points.update((p) => ({ ...p, [key]: value }));
  }

  protected applyPreset(points: BezierPoints): void {
    this.points.set(points);
  }
}
