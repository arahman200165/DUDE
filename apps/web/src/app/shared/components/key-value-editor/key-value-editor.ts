import { Component, input, output } from '@angular/core';
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

/**
 * Reusable editable key/value list (PRD Section 13). Uncontrolled-but-emits,
 * same contract as SplitPane: the parent owns the source of truth and
 * passes the full updated array back in via `pairsChange` on every edit.
 */
@Component({
  selector: 'app-key-value-editor',
  templateUrl: './key-value-editor.html',
})
export class KeyValueEditor {
  readonly pairs = input.required<readonly KeyValuePair[]>();
  readonly pairsChange = output<readonly KeyValuePair[]>();

  readonly keyPlaceholder = input('key');
  readonly valuePlaceholder = input('value');
  readonly addLabel = input('Add pair');
  readonly emptyMessage = input('No entries yet — add one below.');
  /** Optional per-row hint (e.g. a header description) shown as a native tooltip on the key input. */
  readonly keyHint = input<((key: string) => string | undefined) | undefined>(undefined);

  protected onKeyInput(index: number, event: Event): void {
    const key = (event.target as HTMLInputElement).value;
    this.replacePair(index, { ...this.pairs()[index], key });
  }

  protected onValueInput(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.replacePair(index, { ...this.pairs()[index], value });
  }

  protected addPair(): void {
    this.pairsChange.emit([...this.pairs(), { key: '', value: '' }]);
  }

  protected removePair(index: number): void {
    this.pairsChange.emit(this.pairs().filter((_, i) => i !== index));
  }

  protected hintFor(key: string): string | undefined {
    return this.keyHint()?.(key);
  }

  private replacePair(index: number, pair: KeyValuePair): void {
    this.pairsChange.emit(this.pairs().map((existing, i) => (i === index ? pair : existing)));
  }
}
