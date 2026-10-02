
export function OAuthTokenInspector_format(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
