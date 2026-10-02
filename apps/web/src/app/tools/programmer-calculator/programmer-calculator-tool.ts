import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { BitWidth, CalcOp, buildOperandView, computeOp, parseFlexible, toggleBit } from "@dude/tool-engine/tools/programmer-calculator/programmer-calculator";

const WIDTHS: readonly BitWidth[] = [8, 16, 32, 64];

const OPS: readonly { readonly id: CalcOp; readonly label: string; readonly unary?: boolean }[] = [
  { id: 'add', label: '+' },
  { id: 'sub', label: '-' },
  { id: 'mul', label: '×' },
  { id: 'div', label: '÷' },
  { id: 'mod', label: '%' },
  { id: 'and', label: 'AND' },
  { id: 'or', label: 'OR' },
  { id: 'xor', label: 'XOR' },
  { id: 'not', label: 'NOT (A)', unary: true },
  { id: 'shl', label: 'A << B' },
  { id: 'shr', label: 'A >>> B' },
  { id: 'sar', label: 'A >> B' },
];

@Component({
  selector: 'app-programmer-calculator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './programmer-calculator-tool.html',
})
export class ProgrammerCalculatorTool {
  private readonly persistence = inject(PersistenceService);

  protected readonly widths = WIDTHS;
  protected readonly ops = OPS;

  protected readonly width = this.persistence.signal<BitWidth>('programmer-calculator', 'width', 'local', 32);
  protected readonly op = this.persistence.signal<CalcOp>('programmer-calculator', 'op', 'local', 'and');
  protected readonly inputA = this.persistence.signal('programmer-calculator', 'inputA', 'session', '12');
  protected readonly inputB = this.persistence.signal('programmer-calculator', 'inputB', 'session', '10');

  protected readonly parsedA = computed(() => parseFlexible(this.inputA()));
  protected readonly parsedB = computed(() => parseFlexible(this.inputB()));

  protected readonly viewA = computed(() => {
    const parsed = this.parsedA();
    return parsed.ok ? buildOperandView(parsed.value, this.width()) : null;
  });

  protected readonly viewB = computed(() => {
    const parsed = this.parsedB();
    return parsed.ok ? buildOperandView(parsed.value, this.width()) : null;
  });

  protected readonly result = computed(() => {
    const a = this.parsedA();
    const b = this.parsedB();
    if (!a.ok) return a;
    if (!b.ok && this.op() !== 'not') return b;
    return computeOp(a.value, b.ok ? b.value : 0n, this.width(), this.op());
  });

  protected readonly resultView = computed(() => {
    const result = this.result();
    return result.ok ? buildOperandView(result.value, this.width()) : null;
  });

  protected setWidth(width: BitWidth): void {
    this.width.set(width);
  }

  protected setOp(op: CalcOp): void {
    this.op.set(op);
  }

  protected onInputAChange(event: Event): void {
    this.inputA.set((event.target as HTMLInputElement).value);
  }

  protected onInputBChange(event: Event): void {
    this.inputB.set((event.target as HTMLInputElement).value);
  }

  protected toggleBitA(bitIndex: number): void {
    const parsed = this.parsedA();
    if (!parsed.ok) return;
    this.inputA.set(toggleBit(parsed.value, this.width(), bitIndex).toString());
  }
}
