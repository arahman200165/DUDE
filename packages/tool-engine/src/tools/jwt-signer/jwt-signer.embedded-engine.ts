
export function JwtSigner_format(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
