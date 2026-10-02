import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { EndiannessWidth, FloatPrecision, inspectEndianness, inspectIeee754, inspectInteger } from "@dude/tool-engine/tools/numeric-representation-inspector/numeric-representation";

type Tab = 'endianness' | 'ieee754' | 'integer';

@Component({
  selector: 'app-numeric-representation-inspector',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './numeric-representation-inspector.html',
})
export class NumericRepresentationInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly tabs: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: 'endianness', label: 'Endianness' },
    { id: 'ieee754', label: 'IEEE-754 Float' },
    { id: 'integer', label: 'Integer Widths' },
  ];

  protected readonly tab = this.persistence.signal<Tab>('numeric-representation-inspector', 'tab', 'local', 'endianness');

  protected readonly endiannessWidths: readonly EndiannessWidth[] = [16, 32, 64];
  protected readonly endiannessInput = this.persistence.signal('numeric-representation-inspector', 'endiannessInput', 'session', '12345678');
  protected readonly endiannessWidth = this.persistence.signal<EndiannessWidth>('numeric-representation-inspector', 'endiannessWidth', 'local', 32);
  protected readonly endiannessResult = computed(() => inspectEndianness(this.endiannessInput(), this.endiannessWidth()));

  protected readonly floatInput = this.persistence.signal('numeric-representation-inspector', 'floatInput', 'session', '1');
  protected readonly floatPrecision = this.persistence.signal<FloatPrecision>('numeric-representation-inspector', 'floatPrecision', 'local', 32);
  protected readonly floatResult = computed(() => inspectIeee754(this.floatInput(), this.floatPrecision()));

  protected readonly integerInput = this.persistence.signal('numeric-representation-inspector', 'integerInput', 'session', '-1');
  protected readonly integerResult = computed(() => inspectInteger(this.integerInput()));

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected onEndiannessInputChange(event: Event): void {
    this.endiannessInput.set((event.target as HTMLInputElement).value);
  }

  protected setEndiannessWidth(width: EndiannessWidth): void {
    this.endiannessWidth.set(width);
  }

  protected onFloatInputChange(event: Event): void {
    this.floatInput.set((event.target as HTMLInputElement).value);
  }

  protected setFloatPrecision(precision: FloatPrecision): void {
    this.floatPrecision.set(precision);
  }

  protected onIntegerInputChange(event: Event): void {
    this.integerInput.set((event.target as HTMLInputElement).value);
  }
}
