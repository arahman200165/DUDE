import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { parseStruct, StructFieldDef, StructFieldType, StructParseResult } from "@dude/tool-engine/tools/binary-structure-inspector/binary-structure-inspector-logic";

const FIELD_TYPES: readonly StructFieldType[] = ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'uint64', 'int64', 'float32', 'float64', 'char'];

const DEFAULT_FIELDS: readonly StructFieldDef[] = [
  { name: 'magic', type: 'uint32', length: 0, endianness: 'LE' },
  { name: 'version', type: 'uint16', length: 0, endianness: 'LE' },
];

@Component({
  selector: 'app-binary-structure-inspector',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './binary-structure-inspector.html',
})
export class BinaryStructureInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly fieldTypes = FIELD_TYPES;
  protected readonly fields = this.persistence.signal<readonly StructFieldDef[]>('binary-structure-inspector', 'fields', 'local', DEFAULT_FIELDS);

  protected readonly fileName = signal<string | null>(null);
  protected readonly rejection = signal<string | null>(null);
  private readonly bytes = signal<Uint8Array | null>(null);

  protected readonly result = computed<StructParseResult | null>(() => {
    const bytes = this.bytes();
    return bytes ? parseStruct(bytes, this.fields()) : null;
  });

  protected addField(): void {
    this.fields.set([...this.fields(), { name: `field${this.fields().length + 1}`, type: 'uint8', length: 1, endianness: 'LE' }]);
  }

  protected removeField(index: number): void {
    this.fields.set(this.fields().filter((_, i) => i !== index));
  }

  protected updateField(index: number, patch: Partial<StructFieldDef>): void {
    this.fields.set(this.fields().map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  protected onNameChange(index: number, event: Event): void {
    this.updateField(index, { name: (event.target as HTMLInputElement).value });
  }

  protected onTypeChange(index: number, event: Event): void {
    this.updateField(index, { type: (event.target as HTMLSelectElement).value as StructFieldType });
  }

  protected onLengthChange(index: number, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.updateField(index, { length: Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0 });
  }

  protected onEndiannessChange(index: number, event: Event): void {
    this.updateField(index, { endianness: (event.target as HTMLSelectElement).value as 'LE' | 'BE' });
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.fileName.set(file.name);
    this.bytes.set(new Uint8Array(await file.arrayBuffer()));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected clear(): void {
    this.bytes.set(null);
    this.fileName.set(null);
    this.rejection.set(null);
  }
}
