import { Pkcs12Inspector_dnSummary } from "@dude/tool-engine/tools/pkcs12-inspector/pkcs12-inspector.embedded-engine";
import { Component, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { InspectPkcs12Result, inspectPkcs12 } from "@dude/tool-engine/tools/pkcs12-inspector/pkcs12-logic";
import { X509NameField } from "@dude/tool-engine/shared/utils/x509-fields";

/**
 * The PKCS#12 password is the single most sensitive input in this phase —
 * `'none'` persistence, no exceptions (see `AGENTS.md`'s Phase 12 plan).
 * File content is held only as an in-memory `signal<File|null>`-style byte
 * array, matching `file-hash`'s pattern; nothing here is ever persisted.
 */
@Component({
  selector: 'app-pkcs12-inspector',
  imports: [ToolShell, ErrorPanel, CopyButton, FileDrop],
  templateUrl: './pkcs12-inspector.html',
})
export class Pkcs12Inspector {
  protected readonly fileName = signal<string | null>(null);
  private readonly fileBytes = signal<Uint8Array | null>(null);
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);

  protected readonly result = signal<InspectPkcs12Result | null>(null);
  protected readonly rejection = signal<string | null>(null);

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.fileName.set(file.name);
    this.fileBytes.set(new Uint8Array(await file.arrayBuffer()));
    this.result.set(null);
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected toggleShowPassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected inspect(): void {
    const bytes = this.fileBytes();
    if (!bytes) return;
    this.result.set(inspectPkcs12(bytes, this.password()));
  }
  protected dnSummary = Pkcs12Inspector_dnSummary;


  protected clear(): void {
    this.fileName.set(null);
    this.fileBytes.set(null);
    this.password.set('');
    this.result.set(null);
    this.rejection.set(null);
  }
}
