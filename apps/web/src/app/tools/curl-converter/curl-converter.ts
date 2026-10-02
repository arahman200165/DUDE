import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { ParsedHttpRequest, buildFullUrl, splitUrl } from "@dude/domain/shared/http-request/http-request.model";
import { parseCurl } from "@dude/tool-engine/tools/curl-converter/curl-parse";
import { buildCurlCommand } from "@dude/tool-engine/shared/http-request/curl-build";
import { EXPORT_FORMATS, ExportFormatId } from "@dude/tool-engine/shared/http-request/export/curl-export.model";

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * Deliberately does NOT persist raw input — cURL commands routinely embed
 * Authorization headers and cookies (PRD Section 14.1/30), so this tool
 * follows the same "no automatic persistence" pattern as the JWT Debugger.
 */
@Component({
  selector: 'app-curl-converter',
  imports: [ToolShell, SplitPane, KeyValueEditor, CopyButton, ErrorPanel],
  templateUrl: './curl-converter.html',
})
export class CurlConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly methods = METHODS;
  protected readonly formats = EXPORT_FORMATS;

  protected readonly raw = signal('');
  protected readonly parsed = computed(() => parseCurl(this.raw()));
  protected readonly request = computed(() => this.parsed().request);

  protected readonly exportFormat = this.persistence.signal<ExportFormatId>(
    'curl-converter',
    'exportFormat',
    'local',
    'fetch',
  );
  protected readonly exportedCode = computed(() => {
    const format = this.formats.find((f) => f.id === this.exportFormat());
    return format ? format.generate(this.request()) : '';
  });

  protected readonly fullUrl = computed(() => buildFullUrl(this.request()));

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLTextAreaElement).value);
  }

  protected onMethodChange(event: Event): void {
    this.applyEdit({ ...this.request(), method: (event.target as HTMLSelectElement).value });
  }

  protected onUrlInput(event: Event): void {
    const { base, queryParams } = splitUrl((event.target as HTMLInputElement).value);
    this.applyEdit({ ...this.request(), url: base, queryParams });
  }

  protected onQueryParamsChange(queryParams: readonly KeyValuePair[]): void {
    this.applyEdit({ ...this.request(), queryParams });
  }

  protected onHeadersChange(headers: readonly KeyValuePair[]): void {
    this.applyEdit({ ...this.request(), headers });
  }

  protected onBodyInput(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    const currentBody = this.request().body;
    const contentType = currentBody.kind === 'raw' ? currentBody.contentType : null;
    this.applyEdit({
      ...this.request(),
      body: text === '' ? { kind: 'none' } : { kind: 'raw', text, contentType },
    });
  }

  protected onMultipartFieldsChange(fields: readonly KeyValuePair[]): void {
    this.applyEdit({ ...this.request(), body: { kind: 'multipart', fields } });
  }

  protected toggleMultipart(): void {
    const body = this.request().body;
    this.applyEdit({
      ...this.request(),
      body: body.kind === 'multipart' ? { kind: 'none' } : { kind: 'multipart', fields: [] },
    });
  }

  protected addAuth(): void {
    this.applyEdit({ ...this.request(), auth: { username: '', password: '' } });
  }

  protected removeAuth(): void {
    this.applyEdit({ ...this.request(), auth: null });
  }

  protected onAuthUsernameInput(event: Event): void {
    const username = (event.target as HTMLInputElement).value;
    this.applyEdit({ ...this.request(), auth: { username, password: this.request().auth?.password ?? '' } });
  }

  protected onAuthPasswordInput(event: Event): void {
    const password = (event.target as HTMLInputElement).value;
    this.applyEdit({ ...this.request(), auth: { username: this.request().auth?.username ?? '', password } });
  }

  protected setExportFormat(event: Event): void {
    this.exportFormat.set((event.target as HTMLSelectElement).value as ExportFormatId);
  }

  protected clear(): void {
    this.raw.set('');
  }

  private applyEdit(next: ParsedHttpRequest): void {
    this.raw.set(buildCurlCommand(next));
  }
}
