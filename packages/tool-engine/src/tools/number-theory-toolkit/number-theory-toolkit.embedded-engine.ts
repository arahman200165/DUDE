
export function parseBigIntOrNull(input: string): bigint | null {
    const trimmed = input.trim();
    if (!/^-?\d+$/.test(trimmed))
        return null;
    return BigInt(trimmed);
}
export function parseBigIntList(input: string): readonly bigint[] | null {
    const parts = input
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (parts.length === 0)
        return null;
    const values = parts.map(parseBigIntOrNull);
    return values.every((v): v is bigint => v !== null) ? values : null;
}
