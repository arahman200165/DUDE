import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { evaluateExpression, parseScope } from "@dude/tool-engine/tools/expression-evaluator/expression-evaluate";

@Component({
  selector: 'app-expression-evaluator',
  imports: [ToolShell, ErrorPanel, CopyButton, KeyValueEditor],
  templateUrl: './expression-evaluator.html',
})
export class ExpressionEvaluator {
  private readonly persistence = inject(PersistenceService);

  protected readonly expression = this.persistence.signal(
    'expression-evaluator',
    'expression',
    'session',
    'sqrt(x^2 + y^2)',
  );
  protected readonly variables = this.persistence.signal<readonly KeyValuePair[]>('expression-evaluator', 'variables', 'session', [
    { key: 'x', value: '3' },
    { key: 'y', value: '4' },
  ]);

  protected readonly scope = computed(() => parseScope(this.variables()));
  protected readonly result = computed(() => evaluateExpression(this.expression(), this.scope()));

  protected onExpressionChange(event: Event): void {
    this.expression.set((event.target as HTMLInputElement).value);
  }

  protected onVariablesChange(pairs: readonly KeyValuePair[]): void {
    this.variables.set(pairs);
  }
}
