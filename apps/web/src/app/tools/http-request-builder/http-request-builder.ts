import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { buildCurlCommand } from "@dude/tool-engine/shared/http-request/curl-build";
import { EXPORT_FORMATS, ExportFormatId } from "@dude/tool-engine/shared/http-request/export/curl-export.model";
import { parseHttpRequestText } from "@dude/tool-engine/tools/http-request-builder/http-request-parse";

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

type InputMode = 'build' | 'paste';
type OutputFormat = 'curl' | ExportFormatId;

/**
 * Deliberately does NOT persist request fields or the pasted raw text — like
 * cURL Command Inspector/Converter and HTTP Header Inspector, this can carry
 * pasted Authorization headers/cookies (PRD Section 14.1/30, the JWT Debugger
 * pattern). Only UI preferences (mode/output format/assumed scheme) persist.
 */
@Component({
  selector: 'app-http-request-builder',
  imports: [ToolShell, KeyValueEditor, CopyButton, ErrorPanel],
  templateUrl: './http-request-builder.html',
})
export class HttpRequestBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly methods = METHODS;
  protected readonly outputFormats: ReadonlyArray<{ readonly id: OutputFormat; readonly label: string }> = [
    { id: 'curl', label: 'cURL' },
    ...EXPORT_FORMATS.map((format) => ({ id: format.id, label: format.label })),
  ];

  protected readonly inputMode = this.persistence.signal<InputMode>('http-request-builder', 'inputMode', 'local', 'build');
  protected readonly outputFormat = this.persistence.signal<OutputFormat>('http-request-builder', 'outputFormat', 'local', 'curl');
  protected readonly assumeScheme = this.persistence.signal<'http' | 'https'>('http-request-builder', 'assumeScheme', 'local', 'https');

  protected readonly method = signal('GET');
  protected readonly url = signal('https://api.example.com/users');
  protected readonly queryParamPairs = signal<readonly KeyValuePair[]>([]);
  protected readonly headerPairs = signal<readonly KeyValuePair[]>([{ key: 'Accept', value: 'application/json' }]);
  protected readonly bodyText = signal('');

  protected readonly rawRequestText = signal('GET /users HTTP/1.1\nHost: api.example.com\n\n');

  protected readonly builtRequest = computed<ParsedHttpRequest>(() => {
    const contentType = this.headerPairs().find((h) => h.key.toLowerCase() === 'content-type')?.value ?? null;
    return {
      method: this.method(),
      url: this.url(),
      queryParams: this.queryParamPairs(),
      headers: this.headerPairs(),
      body: this.bodyText() === '' ? { kind: 'none' } : { kind: 'raw', text: this.bodyText(), contentType },
      auth: null,
    };
  });

  protected readonly parsedRequest = computed(() => parseHttpRequestText(this.rawRequestText(), this.assumeScheme()));

  protected readonly activeRequest = computed<ParsedHttpRequest>(() =>
    this.inputMode() === 'build' ? this.builtRequest() : this.parsedRequest().request,
  );

  protected readonly outputCode = computed(() => {
    const request = this.activeRequest();
    const format = this.outputFormat();
    if (format === 'curl') return buildCurlCommand(request);
    return EXPORT_FORMATS.find((f) => f.id === format)?.generate(request) ?? '';
  });

  protected setInputMode(mode: InputMode): void {
    this.inputMode.set(mode);
  }

  protected setOutputFormat(event: Event): void {
    this.outputFormat.set((event.target as HTMLSelectElement).value as OutputFormat);
  }

  protected setAssumeScheme(scheme: 'http' | 'https'): void {
    this.assumeScheme.set(scheme);
  }

  protected onMethodChange(event: Event): void {
    this.method.set((event.target as HTMLSelectElement).value);
  }

  protected onUrlInput(event: Event): void {
    this.url.set((event.target as HTMLInputElement).value);
  }

  protected onQueryParamsChange(pairs: readonly KeyValuePair[]): void {
    this.queryParamPairs.set(pairs);
  }

  protected onHeaderPairsChange(pairs: readonly KeyValuePair[]): void {
    this.headerPairs.set(pairs);
  }

  protected onBodyInput(event: Event): void {
    this.bodyText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRawRequestInput(event: Event): void {
    this.rawRequestText.set((event.target as HTMLTextAreaElement).value);
  }
}
