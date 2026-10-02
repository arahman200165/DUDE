import { JwtClaimsAnalyzer_format, JwtClaimsAnalyzer_severityClass } from "@dude/tool-engine/tools/jwt-claims-analyzer/jwt-claims-analyzer.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { decodeJwt } from "@dude/tool-engine/tools/jwt/jwt-decode";
import { ClaimFinding, analyzeClaims } from "@dude/tool-engine/tools/jwt-claims-analyzer/jwt-claims-analyzer-logic";

@Component({
  selector: 'app-jwt-claims-analyzer',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './jwt-claims-analyzer.html',
})
export class JwtClaimsAnalyzer {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('jwt-claims-analyzer', 'input', 'none', '');

  protected readonly decoded = computed(() => decodeJwt(this.input()));
  protected readonly findings = computed<readonly ClaimFinding[]>(() => {
    const current = this.decoded();
    return current.ok ? analyzeClaims(current.header, current.payload) : [];
  });

  protected readonly severityOrder = signal({ error: 0, warning: 1, info: 2 });
  protected readonly sortedFindings = computed(() =>
    [...this.findings()].sort((a, b) => this.severityOrder()[a.severity] - this.severityOrder()[b.severity]),
  );

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }
  protected format = JwtClaimsAnalyzer_format;

  protected severityClass = JwtClaimsAnalyzer_severityClass;

}
