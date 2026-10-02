import { randomHex } from "@dude/tool-engine/tools/multipart-form-builder/multipart-form-builder.embedded-engine";
import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { MultipartField, buildMultipartBody, contentTypeHeader, generateBoundary } from "@dude/tool-engine/tools/multipart-form-builder/multipart-build";


/** Holds no persisted state — File objects aren't serializable, mirroring app-file-drop's own stance. */
@Component({
  selector: 'app-multipart-form-builder',
  imports: [ToolShell, CopyButton, FileDrop],
  templateUrl: './multipart-form-builder.html',
})
export class MultipartFormBuilder {
  protected readonly boundary = signal(generateBoundary(randomHex(8)));
  protected readonly fields = signal<readonly MultipartField[]>([{ kind: 'text', key: 'name', value: 'Ada' }]);

  protected readonly newFieldKey = signal('');
  protected readonly newFieldValue = signal('');
  protected readonly newFileFieldKey = signal('file');

  protected readonly contentType = computed(() => contentTypeHeader(this.boundary()));
  protected readonly body = computed(() => buildMultipartBody(this.fields(), this.boundary()));

  protected regenerateBoundary(): void {
    this.boundary.set(generateBoundary(randomHex(8)));
  }

  protected onNewFieldKeyInput(event: Event): void {
    this.newFieldKey.set((event.target as HTMLInputElement).value);
  }

  protected onNewFieldValueInput(event: Event): void {
    this.newFieldValue.set((event.target as HTMLInputElement).value);
  }

  protected onNewFileFieldKeyInput(event: Event): void {
    this.newFileFieldKey.set((event.target as HTMLInputElement).value);
  }

  protected addTextField(): void {
    const key = this.newFieldKey().trim();
    if (key === '') return;
    this.fields.update((fields) => [...fields, { kind: 'text', key, value: this.newFieldValue() }]);
    this.newFieldKey.set('');
    this.newFieldValue.set('');
  }

  protected onFileSelected(file: File): void {
    const key = this.newFileFieldKey().trim() || 'file';
    this.fields.update((fields) => [...fields, { kind: 'file', key, filename: file.name, contentType: file.type, size: file.size }]);
  }

  protected removeField(index: number): void {
    this.fields.update((fields) => fields.filter((_, i) => i !== index));
  }
}
