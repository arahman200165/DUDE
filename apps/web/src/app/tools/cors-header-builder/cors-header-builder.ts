import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { CorsHeaders, PreflightRequest, buildCorsHeaderText, evaluatePreflight, parseCorsHeaderText } from "@dude/tool-engine/tools/cors-header-builder/cors-headers";

@Component({
  selector: 'app-cors-header-builder',
  imports: [ToolShell, CopyButton],
  templateUrl: './cors-header-builder.html',
})
export class CorsHeaderBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly raw = this.persistence.signal(
    'cors-header-builder',
    'raw',
    'session',
    'Access-Control-Allow-Origin: https://app.example.com\nAccess-Control-Allow-Methods: GET, POST\nAccess-Control-Allow-Headers: Content-Type',
  );

  protected readonly cors = computed(() => parseCorsHeaderText(this.raw()));

  protected readonly requestOrigin = signal('https://app.example.com');
  protected readonly requestMethod = signal('POST');
  protected readonly requestHeaders = signal('Content-Type');

  protected readonly preflight = computed(() =>
    evaluatePreflight(this.cors(), {
      origin: this.requestOrigin(),
      method: this.requestMethod(),
      headers: this.requestHeaders(),
    } satisfies PreflightRequest),
  );

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFieldInput(field: keyof Omit<CorsHeaders, 'allowCredentials'>, event: Event): void {
    this.updateCors({ [field]: (event.target as HTMLInputElement).value } as Partial<CorsHeaders>);
  }

  protected onAllowCredentialsChange(event: Event): void {
    this.updateCors({ allowCredentials: (event.target as HTMLInputElement).checked });
  }

  protected onRequestOriginInput(event: Event): void {
    this.requestOrigin.set((event.target as HTMLInputElement).value);
  }

  protected onRequestMethodInput(event: Event): void {
    this.requestMethod.set((event.target as HTMLInputElement).value);
  }

  protected onRequestHeadersInput(event: Event): void {
    this.requestHeaders.set((event.target as HTMLInputElement).value);
  }

  private updateCors(patch: Partial<CorsHeaders>): void {
    this.raw.set(buildCorsHeaderText({ ...this.cors(), ...patch }));
  }
}
