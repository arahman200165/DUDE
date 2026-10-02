import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { BigCalcOp, computeBigCalc, parseBigInt } from "@dude/tool-engine/tools/bigint-calculator/bigint-calculator";

const OPS: readonly { readonly id: BigCalcOp; readonly label: string; readonly unary?: boolean }[] = [
  { id: 'add', label: 'A + B' },
  { id: 'sub', label: 'A - B' },
  { id: 'mul', label: 'A × B' },
  { id: 'div', label: 'A ÷ B (truncated)' },
  { id: 'mod', label: 'A mod B' },
  { id: 'pow', label: 'A ^ B' },
  { id: 'factorial', label: 'A! (factorial)', unary: true },
];

@Component({
  selector: 'app-bigint-calculator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './bigint-calculator-tool.html',
})
export class BigintCalculatorTool {
  private readonly persistence = inject(PersistenceService);

  protected readonly ops = OPS;

  protected readonly op = this.persistence.signal<BigCalcOp>('bigint-calculator', 'op', 'local', 'pow');
  protected readonly inputA = this.persistence.signal('bigint-calculator', 'inputA', 'session', '2');
  protected readonly inputB = this.persistence.signal('bigint-calculator', 'inputB', 'session', '100');

  protected readonly isUnary = computed(() => this.ops.find((o) => o.id === this.op())?.unary === true);

  protected readonly parsedA = computed(() => parseBigInt(this.inputA()));
  protected readonly parsedB = computed(() => parseBigInt(this.inputB()));

  protected readonly result = computed(() => {
    const a = this.parsedA();
    if (!a.ok) return a;

    if (this.isUnary()) return computeBigCalc(a.value, 0n, this.op());

    const b = this.parsedB();
    if (!b.ok) return b;
    return computeBigCalc(a.value, b.value, this.op());
  });

  protected readonly resultDigitCount = computed(() => {
    const result = this.result();
    if (!result.ok) return 0;
    const abs = result.value < 0n ? -result.value : result.value;
    return abs === 0n ? 1 : abs.toString().length;
  });

  protected setOp(op: BigCalcOp): void {
    this.op.set(op);
  }

  protected onInputAChange(event: Event): void {
    this.inputA.set((event.target as HTMLInputElement).value);
  }

  protected onInputBChange(event: Event): void {
    this.inputB.set((event.target as HTMLInputElement).value);
  }

  protected resultText(): string {
    const result = this.result();
    return result.ok ? result.value.toString() : '';
  }
}
