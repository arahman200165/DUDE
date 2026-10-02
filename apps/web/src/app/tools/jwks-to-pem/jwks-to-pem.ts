import { ConvertedKey, JwksToPem_raw } from "@dude/tool-engine/tools/jwks-to-pem/jwks-to-pem.embedded-engine";
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { JwksKeyEntry, PemConversionResult, convertAllToPem, parseJwksKeys } from "@dude/tool-engine/tools/jwks-to-pem/jwks-to-pem-logic";


@Component({
  selector: 'app-jwks-to-pem',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './jwks-to-pem.html',
})
export class JwksToPem {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('jwks-to-pem', 'input', 'none', '');

  private readonly resultSignal = signal<readonly ConvertedKey[] | null>(null);
  protected readonly result = this.resultSignal.asReadonly();
  protected readonly parseError = signal<string | null>(null);

  protected readonly hasContent = computed(() => this.input().trim() !== '');

  constructor() {
    effect(() => {
      const text = this.input();
      if (text.trim() === '') {
        this.resultSignal.set(null);
        this.parseError.set(null);
        return;
      }

      const parsed = parseJwksKeys(text);
      if (!parsed.ok) {
        this.resultSignal.set(null);
        this.parseError.set(parsed.error);
        return;
      }

      this.parseError.set(null);
      convertAllToPem(parsed.keys).then((converted) => this.resultSignal.set(converted));
    });
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }
  protected raw = JwksToPem_raw;

}
