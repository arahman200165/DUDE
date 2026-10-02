import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { certificateTimeStatus } from "@dude/tool-engine/shared/utils/x509-fields";
import { ParseCertificateResult, parseCertificateFile, parseCertificateText } from "@dude/tool-engine/tools/x509-certificate-inspector/x509-logic";

type InputMode = 'paste' | 'file';
type Tab = 'overview' | 'san' | 'extensions' | 'fingerprints';

@Component({
  selector: 'app-x509-certificate-inspector',
  imports: [ToolShell, ErrorPanel, CopyButton, FileDrop],
  templateUrl: './x509-certificate-inspector.html',
})
export class X509CertificateInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly inputMode = signal<InputMode>('paste');
  protected readonly tab = this.persistence.signal<Tab>('x509-certificate-inspector', 'tab', 'local', 'overview');

  protected readonly input = this.persistence.signal('x509-certificate-inspector', 'input', 'session', '');
  protected readonly rejection = signal<string | null>(null);
  protected readonly fileName = signal<string | null>(null);
  private readonly fileBytesSignal = signal<Uint8Array | null>(null);

  private readonly resultSignal = signal<ParseCertificateResult | null>(null);
  protected readonly result = this.resultSignal.asReadonly();

  protected readonly timeStatus = computed(() => {
    const current = this.resultSignal();
    if (!current || !current.ok) return null;
    return certificateTimeStatus(current.certificate.fields.notBefore, current.certificate.fields.notAfter);
  });

  constructor() {
    effect(() => {
      if (this.inputMode() === 'file') {
        const bytes = this.fileBytesSignal();
        if (!bytes) {
          this.resultSignal.set(null);
          return;
        }
        parseCertificateFile(bytes).then((result) => this.resultSignal.set(result));
        return;
      }

      const text = this.input();
      if (text.trim() === '') {
        this.resultSignal.set(null);
        return;
      }
      parseCertificateText(text).then((result) => this.resultSignal.set(result));
    });
  }

  protected setInputMode(mode: InputMode): void {
    this.inputMode.set(mode);
    this.rejection.set(null);
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.fileName.set(file.name);
    this.fileBytesSignal.set(new Uint8Array(await file.arrayBuffer()));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected clear(): void {
    this.input.set('');
    this.fileName.set(null);
    this.fileBytesSignal.set(null);
    this.rejection.set(null);
  }
}
