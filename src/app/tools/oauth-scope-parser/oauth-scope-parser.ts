import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { annotateKnownScopes, buildScopeString, parseScopeString } from './oauth-scope-parser-logic';

@Component({
  selector: 'app-oauth-scope-parser',
  imports: [ToolShell, WorkbenchTable, SimpleColumnsPipe, CopyButton],
  templateUrl: './oauth-scope-parser.html',
})
export class OAuthScopeParser {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('oauth-scope-parser', 'input', 'none', '');
  protected readonly extraScope = this.persistence.signal('oauth-scope-parser', 'extraScope', 'none', '');

  protected readonly parsed = computed(() => parseScopeString(this.input()));
  protected readonly annotated = computed(() => annotateKnownScopes(this.parsed().scopes));

  protected readonly columns = ['Scope', 'Known?', 'Notes'] as const;
  protected readonly rows = computed(() =>
    this.annotated().map((entry) => [entry.scope, entry.known ? 'Yes' : 'No', entry.description ?? '—']),
  );

  protected readonly builtScopeString = computed(() => buildScopeString([...this.parsed().scopes, this.extraScope()]));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onExtraScopeChange(event: Event): void {
    this.extraScope.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.input.set('');
    this.extraScope.set('');
  }
}
