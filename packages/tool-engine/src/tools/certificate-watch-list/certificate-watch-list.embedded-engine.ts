import { STARTTLS_PROTOCOLS, type StartTlsProtocol, type WatchEntry } from "@dude/contracts/core/platform/network-types";
export function CertificateWatchListTool_statusClass(status?: string): string {
    return status === 'ok' ? 'text-success' : status === 'warning' || status === 'changed' ? 'text-warning' : status === 'expired' || status === 'error' ? 'text-error' : 'text-text-muted';
}
export function CertificateWatchListTool_days(entry: WatchEntry): string {
    const days = entry.last?.daysRemaining;
    return days === undefined ? '—' : days < 0 ? `expired ${-days}d ago` : `${days}d left`;
}
