import { OidcDiscoveryInspector_format, OidcDiscoveryInspector_severityClass } from "@dude/tool-engine/tools/oidc-discovery-inspector/oidc-discovery-inspector.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  DISCOVERY_RECOMMENDED_FIELDS,
  DISCOVERY_REQUIRED_FIELDS,
  parseDiscoveryDocument,
} from "@dude/tool-engine/tools/oidc-discovery-inspector/oidc-discovery-inspector-logic";

@Component({
  selector: 'app-oidc-discovery-inspector',
  imports: [ToolShell, ErrorPanel, DataTable, SimpleColumnsPipe, CopyButton],
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
  protected format = OidcDiscoveryInspector_format;

  protected severityClass = OidcDiscoveryInspector_severityClass;

}
