
export function OidcDiscoveryInspector_format(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
export function OidcDiscoveryInspector_severityClass(severity: 'error' | 'warning' | 'info'): string {
    if (severity === 'error')
        return 'border-error/40 bg-error/10 text-error';
    if (severity === 'warning')
        return 'border-warning/40 bg-warning/10 text-warning';
    return 'border-border bg-panel text-text-muted';
}
