import { StarttlsInspectorTool_view } from "@dude/tool-engine/tools/starttls-inspector/starttls-inspector.embedded-engine";
import { Component, signal } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { CertChainView } from '../../shared/components/cert-chain-view/cert-chain-view';
import { STARTTLS_PROTOCOLS, type NetworkRequest, type StartTlsProtocol } from "@dude/contracts/core/platform/network-types";
import type { StartTlsView } from "@dude/contracts/core/platform/network-live-types";

const DEFAULT_PORTS: Record<StartTlsProtocol, number> = { smtp: 587, imap: 143, pop3: 110, ftp: 21, ldap: 389, postgres: 5432, mysql: 3306, xmpp: 5222 };

/** STARTTLS Inspector (Phase 28 item 21) — all eight protocols on the shared network-starttls state machines. */
@Component({
  selector: 'app-starttls-inspector',
  imports: [NetworkWorkbench, DesktopOnlyControl, CertChainView],
  templateUrl: './starttls-inspector.html',
})
export class StarttlsInspectorTool {
  protected readonly protocols = STARTTLS_PROTOCOLS;
  protected readonly protocol = signal<StartTlsProtocol>('smtp');
  protected readonly host = signal('');
  protected readonly port = signal(587);
  protected readonly customPort = signal(false);

  protected readonly build = (): NetworkRequest => ({
    kind: 'starttls', target: this.host().trim(), starttlsProtocol: this.protocol(),
    ...(this.customPort() ? { port: this.port() } : {}),
  });
  protected setProtocol(event: Event): void {
    const protocol = (event.target as HTMLSelectElement).value as StartTlsProtocol;
    this.protocol.set(protocol);
    if (!this.customPort()) this.port.set(DEFAULT_PORTS[protocol]);
  }
  protected text(event: Event): void { this.host.set((event.target as HTMLInputElement).value); }
  protected setPort(event: Event): void { this.customPort.set(true); this.port.set(Number((event.target as HTMLInputElement).value)); }
  protected view = StarttlsInspectorTool_view;

}
