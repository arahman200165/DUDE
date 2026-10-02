import { parseBigIntOrNull, parseBigIntList } from "@dude/tool-engine/tools/number-theory-toolkit/number-theory-toolkit.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ModOp, checkPrime, factorize, gcdList, lcmList, modInverse, modOp } from "@dude/tool-engine/tools/number-theory-toolkit/number-theory";

type Tab = 'modular' | 'gcd-lcm' | 'primes';



@Component({
  selector: 'app-number-theory-toolkit',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './number-theory-toolkit.html',
})
export class NumberTheoryToolkit {
  private readonly persistence = inject(PersistenceService);

  protected readonly tabs: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: 'modular', label: 'Modular Arithmetic' },
    { id: 'gcd-lcm', label: 'GCD / LCM' },
    { id: 'primes', label: 'Primes' },
  ];
  protected readonly tab = this.persistence.signal<Tab>('number-theory-toolkit', 'tab', 'local', 'modular');

  protected readonly modOps: readonly { readonly id: ModOp; readonly label: string }[] = [
    { id: 'add', label: '(A + B) mod M' },
    { id: 'sub', label: '(A - B) mod M' },
    { id: 'mul', label: '(A × B) mod M' },
    { id: 'pow', label: '(A ^ B) mod M' },
  ];
  protected readonly modOpSelected = this.persistence.signal<ModOp>('number-theory-toolkit', 'modOp', 'local', 'pow');
  protected readonly modA = this.persistence.signal('number-theory-toolkit', 'modA', 'session', '2');
  protected readonly modB = this.persistence.signal('number-theory-toolkit', 'modB', 'session', '10');
  protected readonly modM = this.persistence.signal('number-theory-toolkit', 'modM', 'session', '1000');

  protected readonly modResult = computed(() => {
    const a = parseBigIntOrNull(this.modA());
    const b = parseBigIntOrNull(this.modB());
    const m = parseBigIntOrNull(this.modM());
    if (a === null || b === null || m === null) return { ok: false as const, error: 'Enter whole numbers for A, B, and M.' };
    return modOp(a, b, m, this.modOpSelected());
  });

  protected readonly modInverseResult = computed(() => {
    const a = parseBigIntOrNull(this.modA());
    const m = parseBigIntOrNull(this.modM());
    if (a === null || m === null) return { ok: false as const, error: 'Enter whole numbers for A and M.' };
    return modInverse(a, m);
  });

  protected readonly gcdLcmInput = this.persistence.signal('number-theory-toolkit', 'gcdLcmInput', 'session', '48, 18, 12');
  protected readonly gcdResult = computed(() => {
    const values = parseBigIntList(this.gcdLcmInput());
    if (values === null) return { ok: false as const, error: 'Enter whole numbers separated by commas or spaces.' };
    return gcdList(values);
  });
  protected readonly lcmResult = computed(() => {
    const values = parseBigIntList(this.gcdLcmInput());
    if (values === null) return { ok: false as const, error: 'Enter whole numbers separated by commas or spaces.' };
    return lcmList(values);
  });

  protected readonly primeInput = this.persistence.signal('number-theory-toolkit', 'primeInput', 'session', '97');
  protected readonly primeResult = computed(() => {
    const n = parseBigIntOrNull(this.primeInput());
    if (n === null) return { ok: false as const, error: 'Enter a whole number.' };
    return checkPrime(n);
  });
  protected readonly factorizeResult = computed(() => {
    const n = parseBigIntOrNull(this.primeInput());
    if (n === null) return { ok: false as const, error: 'Enter a whole number of at least 2.' };
    return factorize(n);
  });

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected setModOp(op: ModOp): void {
    this.modOpSelected.set(op);
  }

  protected onModAChange(event: Event): void {
    this.modA.set((event.target as HTMLInputElement).value);
  }

  protected onModBChange(event: Event): void {
    this.modB.set((event.target as HTMLInputElement).value);
  }

  protected onModMChange(event: Event): void {
    this.modM.set((event.target as HTMLInputElement).value);
  }

  protected onGcdLcmInputChange(event: Event): void {
    this.gcdLcmInput.set((event.target as HTMLInputElement).value);
  }

  protected onPrimeInputChange(event: Event): void {
    this.primeInput.set((event.target as HTMLInputElement).value);
  }
}
