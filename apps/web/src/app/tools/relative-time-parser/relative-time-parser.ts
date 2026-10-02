import { toDateTimeLocalValue } from "@dude/tool-engine/tools/relative-time-parser/relative-time-parser.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { formatRelativeTime, parseRelativeText } from "@dude/tool-engine/tools/relative-time-parser/relative-time-parser-logic";


@Component({
  selector: 'app-relative-time-parser',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './relative-time-parser.html',
})
export class RelativeTimeParser {
  private readonly persistence = inject(PersistenceService);

  protected readonly referenceInput = this.persistence.signal(
    'relative-time-parser',
    'referenceInput',
    'session',
    toDateTimeLocalValue(new Date()),
  );
  protected readonly textInput = this.persistence.signal('relative-time-parser', 'textInput', 'session', '3 days ago');
  protected readonly timestampInput = this.persistence.signal(
    'relative-time-parser',
    'timestampInput',
    'session',
    toDateTimeLocalValue(new Date()),
  );

  private readonly referenceMs = computed(() => {
    const ms = new Date(this.referenceInput()).getTime();
    return Number.isNaN(ms) ? Date.now() : ms;
  });

  protected readonly textResult = computed(() => parseRelativeText(this.textInput(), this.referenceMs()));

  protected readonly timestampResult = computed(() => {
    const ms = new Date(this.timestampInput()).getTime();
    if (Number.isNaN(ms)) return { ok: false as const, error: 'Enter a valid date/time.' };
    return formatRelativeTime(ms, this.referenceMs());
  });

  protected onReferenceInputChange(event: Event): void {
    this.referenceInput.set((event.target as HTMLInputElement).value);
  }

  protected onTextInputChange(event: Event): void {
    this.textInput.set((event.target as HTMLInputElement).value);
  }

  protected onTimestampInputChange(event: Event): void {
    this.timestampInput.set((event.target as HTMLInputElement).value);
  }

  protected useNowAsReference(): void {
    this.referenceInput.set(toDateTimeLocalValue(new Date()));
  }
}
