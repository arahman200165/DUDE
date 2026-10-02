import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { CronTimezoneMode, parseCronExpression } from "@dude/tool-engine/tools/cron/cron-parse";

const EXAMPLES: readonly { readonly label: string; readonly expression: string }[] = [
  { label: 'Every minute', expression: '* * * * *' },
  { label: 'Every hour', expression: '0 * * * *' },
  { label: 'Daily at midnight', expression: '0 0 * * *' },
  { label: 'Every Monday at 9am', expression: '0 9 * * 1' },
  { label: '@daily', expression: '@daily' },
];

type RunDirection = 'next' | 'previous';

@Component({
  selector: 'app-cron',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './cron.html',
})
export class Cron {
  private readonly persistence = inject(PersistenceService);

  protected readonly examples = EXAMPLES;
  protected readonly expression = this.persistence.signal('cron', 'expression', 'session', '');
  protected readonly occurrenceCount = this.persistence.signal('cron', 'occurrenceCount', 'local', 5);
  protected readonly tzMode = this.persistence.signal<CronTimezoneMode>('cron', 'tzMode', 'local', 'local');
  protected readonly direction = this.persistence.signal<RunDirection>('cron', 'direction', 'local', 'next');

  protected readonly result = computed(() =>
    parseCronExpression(this.expression(), { count: this.occurrenceCount(), tz: this.tzMode() }),
  );

  protected onExpressionInput(event: Event): void {
    this.expression.set((event.target as HTMLInputElement).value);
  }

  protected setExample(expression: string): void {
    this.expression.set(expression);
  }

  protected onOccurrenceCountChange(event: Event): void {
    this.occurrenceCount.set(Number((event.target as HTMLSelectElement).value));
  }

  protected onTzModeChange(event: Event): void {
    this.tzMode.set((event.target as HTMLSelectElement).value as CronTimezoneMode);
  }

  protected setDirection(direction: RunDirection): void {
    this.direction.set(direction);
  }

  protected clear(): void {
    this.expression.set('');
  }
}
