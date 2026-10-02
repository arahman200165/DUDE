import { ClaimFinding, analyzeClaims } from "./jwt-claims-analyzer-logic.js";
export function JwtClaimsAnalyzer_format(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
export function JwtClaimsAnalyzer_severityClass(severity: ClaimFinding['severity']): string {
    if (severity === 'error')
        return 'text-error';
    if (severity === 'warning')
        return 'text-warning';
    return 'text-text-muted';
}
