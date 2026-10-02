import { clampBase } from "@dude/tool-engine/tools/number-base/number-base.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { BaseParseResult, formatInBase, parseInBase } from "@dude/tool-engine/tools/number-base/number-base-convert";

interface QuickBase {
  readonly base: number;
  readonly label: string;
}
const QUICK_BASES: readonly QuickBase[] = [
  { base: 2, label: 'Binary' },
  { base: 8, label: 'Octal' },
  { base: 10, label: 'Decimal' },
  { base: 16, label: 'Hex' },
];

@Component({
  selector: 'app-number-base',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './number-base.html',
})
export class NumberBase {
  private readonly persistence = inject(PersistenceService);

  protected readonly quickBases = QUICK_BASES;

  private readonly valueText = this.persistence.signal('number-base', 'value', 'local', '255');
  protected readonly quickFieldError = signal<string | null>(null);

  private readonly canonicalValue = computed<bigint>(() => {
    const parsed = parseInBase(this.valueText(), 10);
    return parsed.ok ? parsed.value : 0n;
  });

  protected fieldValue(base: number): string {
    return formatInBase(this.canonicalValue(), base);
  }

  protected onQuickFieldChange(base: number, event: Event): void {
    const parsed = parseInBase((event.target as HTMLInputElement).value, base);
    if (!parsed.ok) {
      this.quickFieldError.set(parsed.error);
      return;
    }
    this.quickFieldError.set(null);
    this.valueText.set(formatInBase(parsed.value, 10));
  }

  protected readonly customInput = signal('');
  protected readonly fromBase = signal(2);
  protected readonly toBase = signal(36);

  protected readonly customResult = computed<BaseParseResult>(() => {
    const parsed = parseInBase(this.customInput(), this.fromBase());
    return parsed;
  });

  protected readonly customOutput = computed(() => {
    const parsed = this.customResult();
    return parsed.ok ? formatInBase(parsed.value, this.toBase()) : '';
  });

  protected onCustomInputChange(event: Event): void {
    this.customInput.set((event.target as HTMLInputElement).value);
  }

  protected onFromBaseChange(event: Event): void {
    this.fromBase.set(clampBase(Number((event.target as HTMLInputElement).value)));
  }

  protected onToBaseChange(event: Event): void {
    this.toBase.set(clampBase(Number((event.target as HTMLInputElement).value)));
  }

  protected copy(value: string): void {
    void navigator.clipboard.writeText(value);
  }
}
