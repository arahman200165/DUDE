import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { UrlEncodeOperation, UrlEncodeVariant, processUrl } from "@dude/tool-engine/tools/url-encode/url-encode-codec";

@Component({
  selector: 'app-url-encode',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './url-encode.html',
})
export class UrlEncode {
  private readonly persistence = inject(PersistenceService);

  protected readonly operation = this.persistence.signal<UrlEncodeOperation>(
    'url-encode',
    'operation',
    'local',
    'encode',
  );
  protected readonly variant = this.persistence.signal<UrlEncodeVariant>(
    'url-encode',
    'variant',
    'local',
    'component',
  );
  protected readonly input = this.persistence.signal('url-encode', 'input', 'session', '');

  protected readonly result = computed(() => processUrl(this.input(), this.operation(), this.variant()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setOperation(operation: UrlEncodeOperation): void {
    this.operation.set(operation);
  }

  protected onVariantChange(event: Event): void {
    this.variant.set((event.target as HTMLSelectElement).value as UrlEncodeVariant);
  }

  protected swap(): void {
    const current = this.result();
    this.input.set(current.ok ? current.value : '');
    this.operation.set(this.operation() === 'encode' ? 'decode' : 'encode');
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(): void {
    const current = this.result();
    if (current.ok) void navigator.clipboard.writeText(current.value);
  }
}
