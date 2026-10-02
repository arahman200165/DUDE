import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { TreeView } from '../../shared/components/tree-view/tree-view';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { binaryValueToTree } from "@dude/tool-engine/shared/components/binary-format-viewer/binary-value-tree";
import { decodeProtobufMessage, parseProtoSchema } from "@dude/tool-engine/tools/protobuf-decoder/protobuf-decode";

@Component({
  selector: 'app-protobuf-decoder',
  imports: [ToolShell, FileDrop, ErrorPanel, TreeView],
  templateUrl: './protobuf-decoder.html',
})
export class ProtobufDecoder {
  private readonly persistence = inject(PersistenceService);

  protected readonly schemaText = this.persistence.signal('protobuf-decoder', 'schemaText', 'session', '');
  protected readonly selectedMessageType = signal<string | null>(null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly payloadBytes = signal<Uint8Array | null>(null);
  protected readonly rejection = signal<string | null>(null);

  protected readonly schemaResult = computed(() => parseProtoSchema(this.schemaText()));

  protected readonly messageTypeNames = computed(() => {
    const current = this.schemaResult();
    return current.ok ? current.messageTypeNames : [];
  });

  protected readonly schemaError = computed(() => {
    const current = this.schemaResult();
    return current.ok ? null : current.error.message;
  });

  protected readonly decodeResult = computed(() => {
    const schema = this.schemaResult();
    const messageType = this.selectedMessageType();
    const bytes = this.payloadBytes();
    if (!schema.ok || !messageType || !bytes) return null;
    return decodeProtobufMessage(schema.root, messageType, bytes);
  });

  protected readonly treeNodes = computed(() => {
    const current = this.decodeResult();
    return current?.ok ? binaryValueToTree(current.value, this.fileName() ?? 'root') : null;
  });

  constructor() {
    effect(() => {
      const names = this.messageTypeNames();
      if (names.length === 0) {
        this.selectedMessageType.set(null);
        return;
      }
      if (!this.selectedMessageType() || !names.includes(this.selectedMessageType()!)) {
        this.selectedMessageType.set(names[0]);
      }
    });
  }

  protected onSchemaTextChange(event: Event): void {
    this.schemaText.set((event.target as HTMLTextAreaElement).value);
  }

  protected selectMessageType(name: string): void {
    this.selectedMessageType.set(name);
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.fileName.set(file.name);
    const buffer = await file.arrayBuffer();
    this.payloadBytes.set(new Uint8Array(buffer));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
    this.fileName.set(null);
    this.payloadBytes.set(null);
  }
}
