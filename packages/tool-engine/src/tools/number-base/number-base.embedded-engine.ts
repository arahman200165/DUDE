
export function clampBase(base: number): number {
    if (Number.isNaN(base))
        return 2;
    return Math.min(36, Math.max(2, Math.trunc(base)));
}
