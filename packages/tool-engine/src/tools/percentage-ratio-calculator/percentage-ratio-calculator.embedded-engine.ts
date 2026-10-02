
export function parseBigIntOrNull(input: string): bigint | null {
    const trimmed = input.trim();
    if (!/^-?\d+$/.test(trimmed))
        return null;
    return BigInt(trimmed);
}
