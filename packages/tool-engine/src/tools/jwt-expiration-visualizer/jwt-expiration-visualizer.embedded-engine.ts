import { JwtTimelineStatus, buildTimeline } from "./jwt-expiration-visualizer-logic.js";
export function JwtExpirationVisualizer_statusLabel(status: JwtTimelineStatus): string {
    switch (status) {
        case 'not-yet-valid':
            return 'Not yet valid';
        case 'active':
            return 'Active';
        case 'expired':
            return 'Expired';
        default:
            return 'No expiry claim';
    }
}
export function JwtExpirationVisualizer_statusClasses(status: JwtTimelineStatus): string {
    switch (status) {
        case 'expired':
            return 'border-error/40 bg-error/10 text-error';
        case 'not-yet-valid':
            return 'border-warning/40 bg-warning/10 text-warning';
        case 'active':
            return 'border-success/40 bg-success/10 text-success';
        default:
            return 'border-border bg-panel text-text-muted';
    }
}
export function JwtExpirationVisualizer_barFillClasses(status: JwtTimelineStatus): string {
    return status === 'expired' ? 'bg-error' : status === 'not-yet-valid' ? 'bg-warning' : 'bg-accent';
}
export function JwtExpirationVisualizer_formatDuration(ms: number): string {
    const abs = Math.abs(ms);
    const seconds = Math.floor(abs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const prefix = ms < 0 ? '-' : '';
    if (days > 0)
        return `${prefix}${days}d ${hours % 24}h`;
    if (hours > 0)
        return `${prefix}${hours}h ${minutes % 60}m`;
    if (minutes > 0)
        return `${prefix}${minutes}m ${seconds % 60}s`;
    return `${prefix}${seconds}s`;
}
