import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  DISCOVERY_RECOMMENDED_FIELDS,
  DISCOVERY_REQUIRED_FIELDS,
  parseDiscoveryDocument,
} from './oidc-discovery-inspector-logic';

@Component({
  selector: 'app-oidc-discovery-inspector',
  imports: [ToolShell, ErrorPanel, WorkbenchTable, SimpleColumnsPipe, CopyButton],
  templateUrl: './oidc-discovery-inspector.html',
})
export class OidcDiscoveryInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('oidc-discovery-inspector', 'input', 'none', '');
  protected readonly result = computed(() => (this.input().trim() === '' ? null : parseDiscoveryDocument(this.input())));

  protected readonly fieldColumns = ['Field', 'Requirement', 'Present?'] as const;
  protected readonly fieldRows = computed(() => {
    const current = this.result();
    if (!current || !current.ok) return [];
    const required = DISCOVERY_REQUIRED_FIELDS.map((field) => [field, 'Required', field in current.doc ? 'Yes' : 'No']);
    const recommended = DISCOVERY_RECOMMENDED_FIELDS.map((field) => [field, 'Recommended', field in current.doc ? 'Yes' : 'No']);
    return [...required, ...recommended];
  });

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }

  protected format(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  protected severityClass(severity: 'error' | 'warning' | 'info'): string {
    if (severity === 'error') return 'border-error/40 bg-error/10 text-error';
    if (severity === 'warning') return 'border-warning/40 bg-warning/10 text-warning';
    return 'border-border bg-panel text-text-muted';
  }
}
