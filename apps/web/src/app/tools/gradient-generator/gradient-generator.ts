import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generateGradient, type GradientOptions, type GradientStop, type GradientType, type RadialShape } from "@dude/tool-engine/tools/gradient-generator/gradient-generator-logic";

@Component({
  selector: 'app-gradient-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './gradient-generator.html',
})
export class GradientGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly type = this.persistence.signal<GradientType>('gradient-generator', 'type', 'local', 'linear');
  protected readonly angle = this.persistence.signal('gradient-generator', 'angle', 'local', 90);
  protected readonly shape = this.persistence.signal<RadialShape>('gradient-generator', 'shape', 'local', 'circle');
  protected readonly stops = this.persistence.signal<readonly GradientStop[]>('gradient-generator', 'stops', 'session', [
    { color: '#3b82f6', position: 0 },
    { color: '#a855f7', position: 100 },
  ]);

  protected readonly options = computed<GradientOptions>(() => ({
    type: this.type(),
    angle: this.angle(),
    shape: this.shape(),
    stops: this.stops(),
  }));

  protected readonly result = computed(() => generateGradient(this.options()));

  protected readonly previewCss = computed(() => {
    const current = this.result();
    return current.ok ? current.css : 'none';
  });

  protected onTypeChange(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as GradientType);
  }

  protected onShapeChange(event: Event): void {
    this.shape.set((event.target as HTMLSelectElement).value as RadialShape);
  }

  protected onAngleChange(event: Event): void {
    this.angle.set(Number((event.target as HTMLInputElement).value));
  }

  protected onStopColorChange(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.stops.update((current) => current.map((s, i) => (i === index ? { ...s, color: value } : s)));
  }

  protected onStopPositionChange(index: number, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.stops.update((current) => current.map((s, i) => (i === index ? { ...s, position: value } : s)));
  }

  protected addStop(): void {
    this.stops.update((current) => [...current, { color: '#ffffff', position: 50 }]);
  }

  protected removeStop(index: number): void {
    this.stops.update((current) => (current.length > 2 ? current.filter((_, i) => i !== index) : current));
  }
}
