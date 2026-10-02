
export function JwtVerify_format(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
