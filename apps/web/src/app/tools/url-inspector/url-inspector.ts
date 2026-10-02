import { KIND_CLASSES, UrlInspector_kindClass } from "@dude/tool-engine/tools/url-inspector/url-inspector.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PasteHandoffService } from '../../core/paste-detect/paste-handoff.service';
import { UrlParts, buildUrl, parseUrl } from "@dude/tool-engine/tools/url-inspector/url-parts";
import { URI_COMPONENT_LEGEND, UriComponentKind, segmentUri } from "@dude/tool-engine/tools/url-inspector/uri-component-visualizer";


@Component({
  selector: 'app-url-inspector',
  imports: [ToolShell, ErrorPanel, CopyButton, KeyValueEditor],
  templateUrl: './url-inspector.html',
})
export class UrlInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly raw = this.persistence.signal(
    'url-inspector',
    'raw',
    'session',
    'https://user@example.com:8443/a/b?x=1&y=2#section',
  );

  protected readonly parsed = computed(() => parseUrl(this.raw()));
  protected readonly segments = computed(() => segmentUri(this.raw()));
  protected readonly legend = URI_COMPONENT_LEGEND;

  constructor() {
    // Smart Paste-Detection prefill (DUDE_PRD.md §21 Phase 21 Item 3) — see PasteHandoffService.
    const handoff = inject(PasteHandoffService).consume('url-inspector');
    if (handoff !== undefined) this.raw.set(handoff);
  }

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }

  protected onFieldChange(field: keyof UrlParts, event: Event): void {
    this.updateParts({ [field]: (event.target as HTMLInputElement).value } as Partial<UrlParts>);
  }

  protected onQueryParamsChange(pairs: readonly KeyValuePair[]): void {
    this.updateParts({ queryParams: pairs });
  }

  protected copyUrl(): void {
    void navigator.clipboard.writeText(this.raw());
  }
  protected kindClass = UrlInspector_kindClass;


  private updateParts(patch: Partial<UrlParts>): void {
    const current = this.parsed();
    if (!current.ok) return;

    const built = buildUrl({ ...current.parts, ...patch });
    if (built.ok) this.raw.set(built.url);
  }
}
