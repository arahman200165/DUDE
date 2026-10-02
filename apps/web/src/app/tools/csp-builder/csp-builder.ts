import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { CSP_DIRECTIVES, CspDirective, buildCsp, checkCspWarnings, parseCsp } from "@dude/tool-engine/tools/csp-builder/csp";

@Component({
  selector: 'app-csp-builder',
  imports: [ToolShell, CopyButton],
  templateUrl: './csp-builder.html',
})
export class CspBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly directiveDefs = CSP_DIRECTIVES;
  protected readonly raw = this.persistence.signal('csp-builder', 'raw', 'session', "default-src 'self'; script-src 'self'; object-src 'none'");

  protected readonly directives = computed(() => parseCsp(this.raw()));
  protected readonly warnings = computed(() => checkCspWarnings(this.directives()));

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }

  protected directiveFor(name: string): CspDirective | undefined {
    return this.directives().find((d) => d.name === name);
  }

  protected toggleDirective(name: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const without = this.directives().filter((d) => d.name !== name);
    const next = checked ? [...without, { name, values: [] }] : without;
    this.raw.set(buildCsp(next));
  }

  protected setDirectiveValues(name: string, event: Event): void {
    const values = (event.target as HTMLInputElement).value.split(/\s+/).filter((v) => v !== '');
    const without = this.directives().filter((d) => d.name !== name);
    this.raw.set(buildCsp([...without, { name, values }]));
  }
}
