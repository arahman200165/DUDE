import { TlsInspectorTool } from './tls-inspector';
import type { TlsInspectView } from '../../core/platform/network-live-types';

function set(tool: TlsInspectorTool, field: string, value: string | boolean): void {
  (tool as unknown as Record<string, { set(value: unknown): void }>)[field].set(value);
}

describe('TlsInspectorTool request builder', () => {
  it('builds a TLS inspection request with SNI, ALPN, and STARTTLS', () => {
    const tool = new TlsInspectorTool();
    set(tool, 'host', ' example.com '); set(tool, 'port', 8443 as unknown as string);
    (tool as unknown as { port: { set(v: number): void } }).port.set(8443);
    set(tool, 'sni', 'api.example.com'); set(tool, 'alpn', 'h2, http/1.1'); set(tool, 'sniNames', 'a.example.com, b.example.com');
    set(tool, 'starttls', 'smtp');
    const request = (tool as unknown as { build(): Record<string, unknown> }).build();
    expect(request).toMatchObject({ kind: 'tls-inspector', target: 'example.com', port: 8443, sni: 'api.example.com', starttlsProtocol: 'smtp', alpn: ['h2', 'http/1.1'], sniNames: ['a.example.com', 'b.example.com'], noSni: false });
    expect(request['clientIdentity']).toBeUndefined();
  });

  it('switches to enumeration and is mutually exclusive with HTTP/3', () => {
    const tool = new TlsInspectorTool();
    set(tool, 'host', 'example.com');
    (tool as unknown as { toggle(f: string, e: Event): void }).toggle('enumerate', { target: { checked: true } } as unknown as Event);
    expect((tool as unknown as { build(): Record<string, unknown> }).build()['kind']).toBe('tls-enumeration');
    (tool as unknown as { toggle(f: string, e: Event): void }).toggle('http3', { target: { checked: true } } as unknown as Event);
    expect((tool as unknown as { build(): Record<string, unknown> }).build()['kind']).toBe('http3-probe');
  });

  it('switches to an HTTP/3 probe and drops TLS-only fields', () => {
    const tool = new TlsInspectorTool();
    set(tool, 'host', 'example.com'); set(tool, 'http3', true); set(tool, 'sni', 'x');
    const request = (tool as unknown as { build(): Record<string, unknown> }).build();
    expect(request['kind']).toBe('http3-probe');
    expect(request['sni']).toBeUndefined();
    expect(request['alpn']).toBeUndefined();
  });

  it('omits SNI when noSni is set and includes a session-only client identity', () => {
    const tool = new TlsInspectorTool();
    set(tool, 'host', 'example.com'); set(tool, 'noSni', true);
    (tool as unknown as { clientPfx: { set(v: unknown): void } }).clientPfx.set({ name: 'id.p12', base64: 'AAAA' });
    set(tool, 'clientPassphrase', 'pw');
    const request = (tool as unknown as { build(): Record<string, unknown> }).build();
    expect(request['noSni']).toBe(true);
    expect(request['sni']).toBeUndefined();
    expect(request['clientIdentity']).toEqual({ pfxBase64: 'AAAA', passphrase: 'pw' });
  });

  it('lays out a handshake timeline from record events', () => {
    const tool = new TlsInspectorTool();
    const view = { handshake: { timings: { tcpMs: 5, totalMs: 40 } }, timeline: [{ atMs: 10, contentType: 'Handshake', handshakeType: 'ServerHello', length: 90 }] } as unknown as TlsInspectView;
    const laid = (tool as unknown as { timelineFor(v: TlsInspectView): { markers: unknown[]; end: number } }).timelineFor(view);
    expect(laid.end).toBe(40);
    expect(laid.markers.length).toBe(3);
  });
});
