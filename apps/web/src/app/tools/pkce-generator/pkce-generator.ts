import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { MAX_VERIFIER_LENGTH, MIN_VERIFIER_LENGTH, PkceMethod, PkcePair, generatePkcePair } from "@dude/tool-engine/tools/pkce-generator/pkce-generator-logic";

@Component({
  selector: 'app-pkce-generator',
  imports: [ToolShell, CopyButton],
  templateUrl: './pkce-generator.html',
})
export class PkceGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly minLength = MIN_VERIFIER_LENGTH;
  protected readonly maxLength = MAX_VERIFIER_LENGTH;

  protected readonly length = this.persistence.signal('pkce-generator', 'length', 'local', 64);
  protected readonly method = this.persistence.signal<PkceMethod>('pkce-generator', 'method', 'local', 'S256');

  protected readonly pair = signal<PkcePair | null>(null);

  constructor() {
    this.generate();
  }

  protected onLengthChange(event: Event): void {
    this.length.set(Number((event.target as HTMLInputElement).value));
  }

  protected setMethod(method: PkceMethod): void {
    this.method.set(method);
    this.generate();
  }

  protected generate(): void {
    generatePkcePair(this.length(), this.method()).then((pair) => this.pair.set(pair));
  }
}
