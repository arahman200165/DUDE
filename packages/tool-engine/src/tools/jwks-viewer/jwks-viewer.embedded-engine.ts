import { JwkSummary, JwksParseResult, parseJwks } from "./jwks-viewer-logic.js";
export function JwksViewer_rowsFor(keys: readonly JwkSummary[]): readonly (readonly string[])[] {
    return keys.map((key) => [
        key.kid ?? '—',
        key.kty ?? '—',
        key.use ?? '—',
        key.alg ?? '—',
        key.importable ? 'Yes' : 'No',
        key.warnings.length > 0 ? key.warnings.join(' ') : '—',
    ]);
}
export function JwksViewer_raw(key: JwkSummary): string {
    return JSON.stringify(key.raw, null, 2);
}
