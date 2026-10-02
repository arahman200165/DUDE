import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PasteHandoffService } from '../../core/paste-detect/paste-handoff.service';
import { downloadFile } from '../../shared/utils/download-file';
import {
  decodeV1Timestamp,
  decodeV6Timestamp,
  decodeV7Timestamp,
  generateUuid,
  inspectUuid,
  PREDEFINED_NAMESPACES,
  type UuidVersion,
} from "@dude/tool-engine/tools/uuid/uuid-tool";
import { formatUuidExport, type UuidExportFormat } from "@dude/tool-engine/tools/uuid/uuid-export";

type NamespaceChoice = keyof typeof PREDEFINED_NAMESPACES | 'custom';

@Component({
  selector: 'app-uuid',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './uuid.html',
})
export class Uuid {
  private readonly persistence = inject(PersistenceService);

  protected readonly namespaceChoices = Object.keys(PREDEFINED_NAMESPACES) as (keyof typeof PREDEFINED_NAMESPACES)[];

  protected readonly generated = this.persistence.signal<readonly string[]>('uuid', 'generated', 'session', []);
  protected readonly inspectInput = this.persistence.signal('uuid', 'inspect', 'session', '');

  protected readonly version = this.persistence.signal<UuidVersion>('uuid', 'version', 'local', 'v4');
  protected readonly exportFormat = this.persistence.signal<UuidExportFormat>('uuid', 'exportFormat', 'local', 'txt');

  protected readonly namespaceChoice = this.persistence.signal<NamespaceChoice>('uuid', 'namespaceChoice', 'session', 'DNS');
  protected readonly customNamespace = this.persistence.signal('uuid', 'customNamespace', 'session', '');
  protected readonly nameInput = this.persistence.signal('uuid', 'name', 'session', '');

  protected readonly generateError = this.persistence.signal('uuid', 'generateError', 'session', '');

  protected readonly inspection = computed(() =>
    this.inspectInput() === '' ? null : inspectUuid(this.inspectInput()),
  );

  protected readonly inspectedTimestamp = computed(() => {
    const result = this.inspection();
    if (!result?.valid) return null;
    if (result.version === 1) return decodeV1Timestamp(this.inspectInput());
    if (result.version === 6) return decodeV6Timestamp(this.inspectInput());
    if (result.version === 7) return decodeV7Timestamp(this.inspectInput());
    return null;
  });

  constructor() {
    // Smart Paste-Detection prefill (DUDE_PRD.md §21 Phase 21 Item 3) — see PasteHandoffService.
    const handoff = inject(PasteHandoffService).consume('uuid');
    if (handoff !== undefined) this.inspectInput.set(handoff);
  }

  protected generate(): void {
    const choice = this.namespaceChoice();
    const namespace = choice === 'custom' ? this.customNamespace() : PREDEFINED_NAMESPACES[choice];
    const result = generateUuid(this.version(), { namespace, name: this.nameInput() });
    if (!result.ok) {
      this.generateError.set(result.error);
      return;
    }
    this.generateError.set('');
    this.generated.update((list) => [result.value, ...list].slice(0, 20));
  }

  protected clearGenerated(): void {
    this.generated.set([]);
  }

  protected onInspectInput(event: Event): void {
    this.inspectInput.set((event.target as HTMLInputElement).value);
  }

  protected onNameInput(event: Event): void {
    this.nameInput.set((event.target as HTMLInputElement).value);
  }

  protected onCustomNamespaceInput(event: Event): void {
    this.customNamespace.set((event.target as HTMLInputElement).value);
  }

  protected onVersionChange(event: Event): void {
    this.version.set((event.target as HTMLSelectElement).value as UuidVersion);
  }

  protected onNamespaceChoiceChange(event: Event): void {
    this.namespaceChoice.set((event.target as HTMLSelectElement).value as NamespaceChoice);
  }

  protected onExportFormatChange(event: Event): void {
    this.exportFormat.set((event.target as HTMLSelectElement).value as UuidExportFormat);
  }

  protected exportGenerated(): void {
    const { text, filename, mimeType } = formatUuidExport(this.generated(), this.exportFormat());
    downloadFile(new Blob([text]), filename, mimeType);
  }

  protected copy(value: string): void {
    void navigator.clipboard.writeText(value);
  }
}
