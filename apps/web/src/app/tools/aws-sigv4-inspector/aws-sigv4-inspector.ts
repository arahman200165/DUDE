import { Component, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import {
  BuildSignedRequestResult,
  InspectSignedRequestResult,
  buildSignedRequest,
  inspectSignedRequest,
} from "@dude/tool-engine/tools/aws-sigv4-inspector/aws-sigv4-inspector-logic";

type Mode = 'build' | 'inspect';

@Component({
  selector: 'app-aws-sigv4-inspector',
  imports: [ToolShell, ErrorPanel, CopyButton, KeyValueEditor],
  templateUrl: './aws-sigv4-inspector.html',
})
export class AwsSigv4Inspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Mode>('aws-sigv4-inspector', 'mode', 'local', 'build');
  protected readonly region = this.persistence.signal('aws-sigv4-inspector', 'region', 'local', 'us-east-1');
  protected readonly service = this.persistence.signal('aws-sigv4-inspector', 'service', 'local', 'execute-api');

  protected readonly method = signal('GET');
  protected readonly url = signal('');
  protected readonly payload = signal('');
  protected readonly unsignedPayload = signal(false);
  protected readonly accessKey = signal('');
  protected readonly secretKey = signal('');
  protected readonly sessionToken = signal('');
  protected readonly headerPairs = signal<readonly KeyValuePair[]>([{ key: 'content-type', value: 'application/json' }]);

  protected readonly inspectHeaderPairs = signal<readonly KeyValuePair[]>([
    { key: 'host', value: '' },
    { key: 'x-amz-date', value: '' },
    { key: 'Authorization', value: '' },
  ]);
  protected readonly inspectSecretKey = signal('');

  protected readonly buildResult = signal<{ readonly ok: true; readonly value: BuildSignedRequestResult } | { readonly ok: false; readonly error: string } | null>(null);
  protected readonly inspectResult = signal<{ readonly ok: true; readonly value: InspectSignedRequestResult } | { readonly ok: false; readonly error: string } | null>(null);

  private readonly pairsToHeaders = (pairs: readonly KeyValuePair[]) => pairs.filter((p) => p.key.trim() !== '').map((p) => [p.key, p.value] as const);

  constructor() {
    effect(() => {
      if (this.mode() !== 'build') return;
      const params = {
        method: this.method(),
        url: this.url(),
        headers: this.pairsToHeaders(this.headerPairs()),
        payload: this.payload(),
        accessKey: this.accessKey(),
        secretKey: this.secretKey(),
        region: this.region(),
        service: this.service(),
        sessionToken: this.sessionToken() || undefined,
        unsignedPayload: this.unsignedPayload(),
      };
      if (params.url === '' || params.accessKey === '' || params.secretKey === '') {
        this.buildResult.set(null);
        return;
      }
      buildSignedRequest(params).then((result) => this.buildResult.set(result));
    });

    effect(() => {
      if (this.mode() !== 'inspect') return;
      const headers = this.pairsToHeaders(this.inspectHeaderPairs());
      if (this.url() === '' || this.inspectSecretKey() === '') {
        this.inspectResult.set(null);
        return;
      }
      inspectSignedRequest({
        method: this.method(),
        url: this.url(),
        headers,
        payload: this.payload(),
        secretKey: this.inspectSecretKey(),
        unsignedPayload: this.unsignedPayload(),
      }).then((result) => this.inspectResult.set(result));
    });
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onMethodInput(event: Event): void {
    this.method.set((event.target as HTMLInputElement).value);
  }

  protected onUrlInput(event: Event): void {
    this.url.set((event.target as HTMLInputElement).value);
  }

  protected onPayloadInput(event: Event): void {
    this.payload.set((event.target as HTMLTextAreaElement).value);
  }

  protected onUnsignedPayloadChange(event: Event): void {
    this.unsignedPayload.set((event.target as HTMLInputElement).checked);
  }

  protected onAccessKeyInput(event: Event): void {
    this.accessKey.set((event.target as HTMLInputElement).value);
  }

  protected onSecretKeyInput(event: Event): void {
    this.secretKey.set((event.target as HTMLInputElement).value);
  }

  protected onInspectSecretKeyInput(event: Event): void {
    this.inspectSecretKey.set((event.target as HTMLInputElement).value);
  }

  protected onSessionTokenInput(event: Event): void {
    this.sessionToken.set((event.target as HTMLInputElement).value);
  }

  protected onRegionInput(event: Event): void {
    this.region.set((event.target as HTMLInputElement).value);
  }

  protected onServiceInput(event: Event): void {
    this.service.set((event.target as HTMLInputElement).value);
  }

  protected onHeaderPairsChange(pairs: readonly KeyValuePair[]): void {
    this.headerPairs.set(pairs);
  }

  protected onInspectHeaderPairsChange(pairs: readonly KeyValuePair[]): void {
    this.inspectHeaderPairs.set(pairs);
  }
}
