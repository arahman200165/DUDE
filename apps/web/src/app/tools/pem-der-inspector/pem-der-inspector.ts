import { PemDerInspector_hex } from "@dude/tool-engine/tools/pem-der-inspector/pem-der-inspector.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { TreeView, TreeNode } from '../../shared/components/tree-view/tree-view';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { bytesToHex } from "@dude/tool-engine/shared/utils/byte-codec";
import { asn1ToTreeNode } from "@dude/tool-engine/tools/pem-der-inspector/asn1-to-tree-node";
import { COMMON_PEM_TYPES, ParseResult, derToPem, parsePemOrDerFile, parsePemOrHexDer } from "@dude/tool-engine/tools/pem-der-inspector/pem-der-logic";

type InputMode = 'paste' | 'file';
type ViewMode = 'tree' | 'hex';

@Component({
  selector: 'app-pem-der-inspector',
  imports: [ToolShell, ErrorPanel, CopyButton, FileDrop, TreeView],
  templateUrl: './pem-der-inspector.html',
})
export class PemDerInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly commonPemTypes = COMMON_PEM_TYPES;

  protected readonly inputMode = signal<InputMode>('paste');
  protected readonly viewMode = this.persistence.signal<ViewMode>('pem-der-inspector', 'viewMode', 'local', 'tree');
  protected readonly pemType = this.persistence.signal<string>('pem-der-inspector', 'pemType', 'local', 'CERTIFICATE');

  protected readonly input = this.persistence.signal('pem-der-inspector', 'input', 'session', '');
  protected readonly rejection = signal<string | null>(null);
  protected readonly fileName = signal<string | null>(null);
  private readonly fileBytesSignal = signal<Uint8Array | null>(null);

  protected readonly result = computed<ParseResult | null>(() => {
    if (this.inputMode() === 'file') {
      const bytes = this.fileBytesSignal();
      return bytes ? parsePemOrDerFile(bytes) : null;
    }
    if (this.input().trim() === '') return null;
    return parsePemOrHexDer(this.input());
  });

  protected readonly treeNodesByBlock = computed<readonly { readonly label: string; readonly nodes: readonly TreeNode[]; readonly der: Uint8Array }[]>(() => {
    const current = this.result();
    if (!current || !current.ok) return [];
    if (current.kind === 'pem') {
      return current.blocks.map((block, index) => ({
        label: current.blocks.length > 1 ? `Block ${index + 1}: ${block.type}` : block.type,
        nodes: [asn1ToTreeNode(block.tree, block.type, '$')],
        der: block.der,
      }));
    }
    return [{ label: 'DER', nodes: [asn1ToTreeNode(current.tree, 'DER', '$')], der: current.der }];
  });

  protected setInputMode(mode: InputMode): void {
    this.inputMode.set(mode);
    this.rejection.set(null);
  }

  protected setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onPemTypeChange(event: Event): void {
    this.pemType.set((event.target as HTMLSelectElement).value);
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.fileName.set(file.name);
    this.fileBytesSignal.set(new Uint8Array(await file.arrayBuffer()));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }
  protected hex = PemDerInspector_hex;


  protected toPem(der: Uint8Array): string {
    return derToPem(der, this.pemType());
  }

  protected clear(): void {
    this.input.set('');
    this.fileName.set(null);
    this.fileBytesSignal.set(null);
    this.rejection.set(null);
  }
}
