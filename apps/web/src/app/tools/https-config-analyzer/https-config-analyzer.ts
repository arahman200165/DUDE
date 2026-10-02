import { HttpsConfigAnalyzerTool_view } from "@dude/tool-engine/tools/https-config-analyzer/https-config-analyzer.embedded-engine";
import { Component, signal } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FindingsList, type Finding } from '../../shared/components/findings-list/findings-list';
import type { NetworkRequest } from "@dude/contracts/core/platform/network-types";
import type { HttpsAnalysisView } from "@dude/contracts/core/platform/network-live-types";

/**
 * HTTPS Configuration Analyzer (Phase 28 item 15). Composite findings, no letter grade — DUDE does
 * not imply a standard scoring rubric. It includes TLS enumeration, so it is reviewed before it runs.
 */
@Component({
  selector: 'app-https-config-analyzer',
  imports: [NetworkWorkbench, DesktopOnlyControl, FindingsList],
  templateUrl: './https-config-analyzer.html',
})
export class HttpsConfigAnalyzerTool {
  protected readonly host = signal('');
  protected readonly port = signal(443);
  protected readonly build = (): NetworkRequest => ({ kind: 'https-analyzer', target: this.host().trim(), port: this.port() });
  protected text(event: Event): void { this.host.set((event.target as HTMLInputElement).value); }
  protected setPort(event: Event): void { this.port.set(Number((event.target as HTMLInputElement).value)); }
  protected view = HttpsConfigAnalyzerTool_view;

  protected findings(view: HttpsAnalysisView): readonly Finding[] { return view.findings as readonly Finding[]; }
}
