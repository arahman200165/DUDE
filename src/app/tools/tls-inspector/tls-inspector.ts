import { Component, computed, signal } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FindingsList } from '../../shared/components/findings-list/findings-list';
import { CertChainView } from '../../shared/components/cert-chain-view/cert-chain-view';
import { Timeline } from '../../shared/components/timeline/timeline';
import type { ClientIdentity, NetworkRequest, StartTlsProtocol } from '../../core/platform/network-types';
import { STARTTLS_PROTOCOLS } from '../../core/platform/network-types';
import type { Http3View, TlsEnumerationView, TlsInspectView } from '../../core/platform/network-live-types';
import type { TimelineMarkerInput } from '../../shared/components/timeline/timeline-layout';

type Tab = 'connection' | 'chain' | 'timeline' | 'weaknesses' | 'http3';

/**
 * TLS Connection Inspector (Phase 28 items 10, 13, 14, 22, plus mTLS and HTTP/3). The mTLS
 * identity is session-only: the PFX/PEM is sent for this run and never persisted (run history
 * strips `clientIdentity`).
 */
@Component({
  selector: 'app-tls-inspector',
  imports: [NetworkWorkbench, DesktopOnlyControl, FindingsList, CertChainView, Timeline],
  templateUrl: './tls-inspector.html',
})
export class TlsInspectorTool {
  protected readonly starttlsProtocols = STARTTLS_PROTOCOLS;
  protected readonly host = signal('');
  protected readonly port = signal(443);
  protected readonly sni = signal('');
  protected readonly noSni = signal(false);
  protected readonly alpn = signal('h2, http/1.1');
  protected readonly sniNames = signal('');
  protected readonly starttls = signal<'' | StartTlsProtocol>('');
  protected readonly http3 = signal(false);
  protected readonly enumerate = signal(false);
  protected readonly clientPfx = signal<{ name: string; base64: string } | null>(null);
  protected readonly clientPassphrase = signal('');
  protected readonly tab = signal<Tab>('connection');

  protected readonly build = (): NetworkRequest => {
    const identity: ClientIdentity | undefined = this.clientPfx() ? { pfxBase64: this.clientPfx()!.base64, ...(this.clientPassphrase() ? { passphrase: this.clientPassphrase() } : {}) } : undefined;
    return {
      kind: this.http3() ? 'http3-probe' : this.enumerate() ? 'tls-enumeration' : 'tls-inspector', target: this.host().trim(), port: this.port(),
      ...(this.http3() ? {} : {
        noSni: this.noSni(), ...(this.noSni() ? {} : this.sni().trim() ? { sni: this.sni().trim() } : {}),
        alpn: this.alpn().split(/[\s,]+/).map((value) => value.trim()).filter(Boolean),
        ...(this.sniNames().trim() ? { sniNames: this.sniNames().split(/[\s,]+/).map((value) => value.trim()).filter(Boolean) } : {}),
        ...(this.starttls() ? { starttlsProtocol: this.starttls() as StartTlsProtocol } : {}),
        ...(identity ? { clientIdentity: identity } : {}),
      }),
    };
  };

  protected text(field: 'host' | 'sni' | 'alpn' | 'sniNames' | 'clientPassphrase', event: Event): void { this[field].set((event.target as HTMLInputElement).value); }
  protected setPort(event: Event): void { this.port.set(Number((event.target as HTMLInputElement).value)); }
  protected toggle(field: 'noSni' | 'http3' | 'enumerate', event: Event): void {
    this[field].set((event.target as HTMLInputElement).checked);
    if (field === 'http3' && this.http3()) this.enumerate.set(false);
    if (field === 'enumerate' && this.enumerate()) this.http3.set(false);
  }
  protected enumView(result: unknown): TlsEnumerationView | null { return result && 'supportedVersions' in (result as object) ? result as TlsEnumerationView : null; }
  protected supportedCiphers(view: TlsEnumerationView): TlsEnumerationView['ciphers'] { return view.ciphers.filter((probe) => probe.state === 'supported'); }
  protected setStarttls(event: Event): void { this.starttls.set((event.target as HTMLSelectElement).value as '' | StartTlsProtocol); }
  protected async loadPfx(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) { this.clientPfx.set(null); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = ''; bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    this.clientPfx.set({ name: file.name, base64: btoa(binary) });
  }
  protected view(result: unknown): TlsInspectView | null { return result && (result as TlsInspectView).handshake ? result as TlsInspectView : null; }
  protected http3View(result: unknown): Http3View | null { return result && 'negotiatedProtocol' in (result as object) ? result as Http3View : null; }

  protected readonly timelineFor = (view: TlsInspectView): { markers: TimelineMarkerInput[]; end: number } => {
    const events = view.timeline ?? [];
    const end = Math.max(view.handshake.timings.totalMs, ...events.map((event) => event.atMs), 1);
    const markers: TimelineMarkerInput[] = [];
    if (view.handshake.timings.tcpMs !== null) markers.push({ epochMs: view.handshake.timings.tcpMs, label: `TCP ${view.handshake.timings.tcpMs}ms`, emphasis: 'accent' });
    for (const event of events) markers.push({ epochMs: event.atMs, label: event.handshakeType ?? event.contentType });
    markers.push({ epochMs: end, label: `done ${end}ms`, emphasis: 'now' });
    return { markers, end };
  };
  protected statusClass(status: string): string { return status === 'fail' ? 'text-error' : status === 'warn' ? 'text-warning' : 'text-success'; }
}
