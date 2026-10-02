import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  CSR_SUBJECT_FIELD_LABELS,
  CSR_SUBJECT_SHORT_NAMES,
  CsrSubjectField,
  CsrSubjectShortName,
  GenerateCsrResult,
  InspectCsrResult,
  generateCsr,
  inspectCsr,
} from "@dude/tool-engine/tools/csr-generator-inspector/csr-logic";

type Mode = 'generate' | 'inspect';

/**
 * Deliberately does not persist the signing private key or the generated
 * CSR — mirrors `jwt-signer`/`asymmetric-key-generator`'s precedent for
 * key material. Subject fields (public-structure, not secret) persist per
 * session. Signing is pure `node-forge` — no network, no Worker (RSA
 * signing at 2048/3072/4096 bits is fast; key *generation* is the
 * CPU-bound part, and that already happened in Asymmetric Key Generator).
 */
@Component({
  selector: 'app-csr-generator-inspector',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './csr-generator-inspector.html',
})
export class CsrGeneratorInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly subjectShortNames = CSR_SUBJECT_SHORT_NAMES;
  protected readonly subjectFieldLabels = CSR_SUBJECT_FIELD_LABELS;

  protected readonly mode = this.persistence.signal<Mode>('csr-generator-inspector', 'mode', 'local', 'generate');

  protected readonly subjectValues = this.persistence.signal<Readonly<Record<CsrSubjectShortName, string>>>(
    'csr-generator-inspector',
    'subjectValues',
    'session',
    { CN: '', O: '', OU: '', L: '', ST: '', C: '', E: '' },
  );

  protected readonly privateKeyPem = signal('');
  protected readonly csrPemInput = signal('');

  protected readonly generateResult = signal<GenerateCsrResult | null>(null);
  protected readonly inspectResult = computed<InspectCsrResult | null>(() =>
    this.csrPemInput().trim() === '' ? null : inspectCsr(this.csrPemInput()),
  );

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.generateResult.set(null);
  }

  protected onSubjectFieldInput(shortName: CsrSubjectShortName, event: Event): void {
    this.subjectValues.update((current) => ({ ...current, [shortName]: (event.target as HTMLInputElement).value }));
  }

  protected onPrivateKeyInput(event: Event): void {
    this.privateKeyPem.set((event.target as HTMLTextAreaElement).value);
  }

  protected onCsrPemInput(event: Event): void {
    this.csrPemInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected generate(): void {
    const fields: CsrSubjectField[] = this.subjectShortNames.map((shortName) => ({
      shortName,
      value: this.subjectValues()[shortName],
    }));
    this.generateResult.set(generateCsr(fields, this.privateKeyPem()));
  }

  protected clearGenerate(): void {
    this.privateKeyPem.set('');
    this.generateResult.set(null);
  }

  protected clearInspect(): void {
    this.csrPemInput.set('');
  }
}
