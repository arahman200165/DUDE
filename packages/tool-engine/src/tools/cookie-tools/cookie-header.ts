/**
 * Pure, framework-free parse/build for the request `Cookie:` header (RFC 6265 §4.2) —
 * a flat `name=value; name2=value2` list, distinct from the response `Set-Cookie:`
 * header (see set-cookie.ts), which carries one cookie plus attributes.
 */
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

export function parseCookieHeader(raw: string): readonly KeyValuePair[] {
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const equalsIndex = part.indexOf('=');
      if (equalsIndex === -1) return { key: part, value: '' };
      return { key: part.slice(0, equalsIndex).trim(), value: part.slice(equalsIndex + 1).trim() };
    });
}

export function buildCookieHeader(pairs: readonly KeyValuePair[]): string {
  return pairs
    .filter((pair) => pair.key !== '')
    .map((pair) => `${pair.key}=${pair.value}`)
    .join('; ');
}
