import type { Http3View, TlsEnumerationView, TlsInspectView } from "@dude/contracts/core/platform/network-live-types";
export function TlsInspectorTool_captureView(result: unknown): {
    inspection: TlsInspectView;
    capture: {
        available: boolean;
        packets: number | null;
        pcapngBase64: string | null;
        filter: string;
        note: string;
        error?: string;
    };
} | null {
    return result && 'capture' in (result as object) && 'inspection' in (result as object) ? result as never : null;
}
export function TlsInspectorTool_enumView(result: unknown): TlsEnumerationView | null { return result && 'supportedVersions' in (result as object) ? result as TlsEnumerationView : null; }
export function TlsInspectorTool_supportedCiphers(view: TlsEnumerationView): TlsEnumerationView['ciphers'] { return view.ciphers.filter((probe) => probe.state === 'supported'); }
export function TlsInspectorTool_view(result: unknown): TlsInspectView | null { return result && (result as TlsInspectView).handshake ? result as TlsInspectView : null; }
export function TlsInspectorTool_http3View(result: unknown): Http3View | null { return result && 'negotiatedProtocol' in (result as object) ? result as Http3View : null; }
export function TlsInspectorTool_statusClass(status: string): string { return status === 'fail' ? 'text-error' : status === 'warn' ? 'text-warning' : 'text-success'; }
