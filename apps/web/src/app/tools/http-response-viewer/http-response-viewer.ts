import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { HTTP_STATUS_CODES } from "@dude/tool-engine/shared/utils/http-status-codes";
import { consumeWorkspaceState } from "@dude/tool-engine/core/workspace/workspace-handoff";
import { parseHttpResponseText } from "@dude/tool-engine/tools/http-response-viewer/http-response-parse";

const SAMPLE_RESPONSE = [
  'HTTP/1.1 200 OK',
  'Content-Type: application/json',
  'Cache-Control: no-store',
  '',
  '{"ok":true,"data":{"id":1,"name":"example"}}',
].join('\n');

/**
 * Deliberately does NOT persist raw input — a pasted response can carry
 * Set-Cookie values or other sensitive response headers, so this follows the
 * same "no automatic persistence" pattern as cURL Command Inspector/Converter.
 */
@Component({
  selector: 'app-http-response-viewer',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './http-response-viewer.html',
})
export class HttpResponseViewer {
  protected readonly raw = signal(SAMPLE_RESPONSE);
  protected readonly result = computed(() => parseHttpResponseText(this.raw()));

  constructor() {
    // Workspace tab-restore hand-off (DUDE_PRD.md §21 Phase 21 Item 4) — see
    // http-response-viewer.workspace-step.ts. In-memory only, never touches storage.
    const workspaceState = consumeWorkspaceState('http-response-viewer');
    if (typeof workspaceState?.['raw'] === 'string') this.raw.set(workspaceState['raw']);
  }

  protected readonly statusInfo = computed(() => {
    const current = this.result();
    if (!current.ok) return null;
    return HTTP_STATUS_CODES.find((entry) => entry.code === current.statusCode) ?? null;
  });

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLTextAreaElement).value);
  }

  protected loadSample(): void {
    this.raw.set(SAMPLE_RESPONSE);
  }

  protected clear(): void {
    this.raw.set('');
  }
}
