/** What replaces a secret in captured output and diagnostics. */
export const REDACTED = '[redacted]';

/**
 * A Cloudflare tunnel connector token is base64 of a JSON object (`{"a":...,"t":...,"s":...}`), so it always starts with
 * `eyJ`. The pattern is deliberately loose (short minimum, both base64 alphabets): over-redacting a log line is harmless,
 * leaking a token is not.
 */
const CONNECTOR_TOKEN = /eyJ[A-Za-z0-9+/_-]{8,}={0,2}/g;
/** `TUNNEL_TOKEN=...`, `TUNNEL_TOKEN: ...` and `--token <value>` forms a tool may echo back. */
const TOKEN_ASSIGNMENT = /(?<![\w-])(TUNNEL_TOKEN|--token)([=\s:]+)\S+/gi;
/** Shorter secrets would mangle ordinary text; they are not what this guards. */
const MIN_LITERAL_LENGTH = 6;

/**
 * Builds the redaction function for one child process: every literal secret value handed to it (longest first), the connector
 * token pattern and token assignments. Pure; safe to call on any text.
 */
export function createRedactor(secrets: readonly string[] = []): (text: string) => string {
  const literals = [...new Set(secrets)].filter((value) => value.length >= MIN_LITERAL_LENGTH).sort((a, b) => b.length - a.length);
  return (text) => {
    let out = text;
    for (const literal of literals) out = out.split(literal).join(REDACTED);
    return out.replace(TOKEN_ASSIGNMENT, `$1$2${REDACTED}`).replace(CONNECTOR_TOKEN, REDACTED);
  };
}
