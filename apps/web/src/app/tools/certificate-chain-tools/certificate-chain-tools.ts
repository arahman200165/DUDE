import { CertificateChainTools_dnSummary } from "@dude/tool-engine/tools/certificate-chain-tools/certificate-chain-tools.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import {
  ChainEntry,
  ChainVerificationResult,
  assembleBundle,
  linkChain,
  splitPemBundle,
  verifyChain,
} from "@dude/tool-engine/tools/certificate-chain-tools/certificate-chain-logic";
import { X509NameField } from "@dude/tool-engine/shared/utils/x509-fields";

@Component({
  selector: 'app-certificate-chain-tools',
  imports: [ToolShell, ErrorPanel, CopyButton, FileDrop],
  templateUrl: './certificate-chain-tools.html',
})
export class CertificateChainTools {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('certificate-chain-tools', 'input', 'session', '');
  protected readonly rejection = signal<string | null>(null);

  protected readonly splitError = signal<string | null>(null);
  protected readonly entries = signal<readonly ChainEntry[]>([]);
  protected readonly linkWarnings = signal<readonly string[]>([]);
  protected readonly verification = signal<ChainVerificationResult | null>(null);

  protected readonly bundle = computed(() => assembleBundle(this.entries().map((e) => e.pem)));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected async onFilesSelected(files: readonly File[]): Promise<void> {
    this.rejection.set(null);
    const texts = await Promise.all(files.map((f) => f.text()));
    this.input.set(texts.join('\n'));
    this.split();
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected split(): void {
    this.verification.set(null);
    this.linkWarnings.set([]);
    const result = splitPemBundle(this.input());
    if (result.ok) {
      this.entries.set(result.entries);
      this.splitError.set(null);
    } else {
      this.entries.set([]);
      this.splitError.set(result.error);
    }
  }

  protected autoLink(): void {
    const { ordered, warnings } = linkChain(this.entries());
    this.entries.set(ordered);
    this.linkWarnings.set(warnings);
    this.verification.set(null);
  }

  protected moveUp(index: number): void {
    if (index === 0) return;
    const next = [...this.entries()];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    this.entries.set(next);
    this.verification.set(null);
  }

  protected moveDown(index: number): void {
    const current = this.entries();
    if (index === current.length - 1) return;
    const next = [...current];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    this.entries.set(next);
    this.verification.set(null);
  }

  protected remove(index: number): void {
    this.entries.set(this.entries().filter((_, i) => i !== index));
    this.verification.set(null);
  }

  protected verify(): void {
    this.verification.set(verifyChain(this.entries().map((e) => e.pem)));
  }
  protected dnSummary = CertificateChainTools_dnSummary;


  protected download(): void {
    downloadFile(new TextEncoder().encode(this.bundle()), 'chain.pem', 'application/x-pem-file');
  }

  protected clear(): void {
    this.input.set('');
    this.entries.set([]);
    this.splitError.set(null);
    this.linkWarnings.set([]);
    this.verification.set(null);
    this.rejection.set(null);
  }
}
