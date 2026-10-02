import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PkceMethod, PkceVerifyResult, verifyPkce } from "@dude/tool-engine/tools/pkce-verifier/pkce-verifier-logic";

@Component({
  selector: 'app-pkce-verifier',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './pkce-verifier.html',
})
export class PkceVerifier {
  private readonly persistence = inject(PersistenceService);

  protected readonly method = this.persistence.signal<PkceMethod>('pkce-verifier', 'method', 'local', 'S256');
  protected readonly verifier = signal('');
  protected readonly challenge = signal('');
  protected readonly result = signal<PkceVerifyResult | null>(null);

  protected onVerifierInput(event: Event): void {
    this.verifier.set((event.target as HTMLTextAreaElement).value);
  }

  protected onChallengeInput(event: Event): void {
    this.challenge.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMethod(method: PkceMethod): void {
    this.method.set(method);
  }

  protected verify(): void {
    verifyPkce({ verifier: this.verifier(), challenge: this.challenge(), method: this.method() }).then((result) =>
      this.result.set(result),
    );
  }

  protected clear(): void {
    this.verifier.set('');
    this.challenge.set('');
    this.result.set(null);
  }
}
