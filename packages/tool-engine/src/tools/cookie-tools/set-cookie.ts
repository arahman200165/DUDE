/**
 * Pure, framework-free parse/build for the response `Set-Cookie:` header (RFC 6265 §4.1) —
 * one cookie plus attributes, always-synced with a structured field set (mirrors the
 * raw-text/structured round-trip already used by http-header-inspector, query-string).
 */
export type SameSite = '' | 'Strict' | 'Lax' | 'None';

export interface SetCookieAttributes {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expires: string;
  readonly maxAge: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite: SameSite;
}

export const EMPTY_SET_COOKIE: SetCookieAttributes = {
  name: '',
  value: '',
  domain: '',
  path: '',
  expires: '',
  maxAge: '',
  secure: false,
  httpOnly: false,
  sameSite: '',
};

const SAME_SITE_VALUES: readonly SameSite[] = ['Strict', 'Lax', 'None'];

export function parseSetCookieHeader(raw: string): SetCookieAttributes {
  const parts = raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return EMPTY_SET_COOKIE;

  const [nameValue, ...attributeParts] = parts;
  const equalsIndex = nameValue.indexOf('=');
  const name = equalsIndex === -1 ? nameValue : nameValue.slice(0, equalsIndex).trim();
  const value = equalsIndex === -1 ? '' : nameValue.slice(equalsIndex + 1).trim();

  let domain = '';
  let path = '';
  let expires = '';
  let maxAge = '';
  let secure = false;
  let httpOnly = false;
  let sameSite: SameSite = '';

  for (const attribute of attributeParts) {
    const attrEquals = attribute.indexOf('=');
    const attrName = (attrEquals === -1 ? attribute : attribute.slice(0, attrEquals)).trim().toLowerCase();
    const attrValue = attrEquals === -1 ? '' : attribute.slice(attrEquals + 1).trim();

    switch (attrName) {
      case 'domain':
        domain = attrValue;
        break;
      case 'path':
        path = attrValue;
        break;
      case 'expires':
        expires = attrValue;
        break;
      case 'max-age':
        maxAge = attrValue;
        break;
      case 'secure':
        secure = true;
        break;
      case 'httponly':
        httpOnly = true;
        break;
      case 'samesite': {
        const match = SAME_SITE_VALUES.find((v) => v.toLowerCase() === attrValue.toLowerCase());
        if (match) sameSite = match;
        break;
      }
      default:
        break;
    }
  }

  return { name, value, domain, path, expires, maxAge, secure, httpOnly, sameSite };
}

export function buildSetCookieHeader(attributes: SetCookieAttributes): string {
  if (attributes.name === '') return '';

  const parts = [`${attributes.name}=${attributes.value}`];
  if (attributes.domain !== '') parts.push(`Domain=${attributes.domain}`);
  if (attributes.path !== '') parts.push(`Path=${attributes.path}`);
  if (attributes.expires !== '') parts.push(`Expires=${attributes.expires}`);
  if (attributes.maxAge !== '') parts.push(`Max-Age=${attributes.maxAge}`);
  if (attributes.secure) parts.push('Secure');
  if (attributes.httpOnly) parts.push('HttpOnly');
  if (attributes.sameSite !== '') parts.push(`SameSite=${attributes.sameSite}`);

  return parts.join('; ');
}

/** Common real-world Set-Cookie mistakes, worded as signals rather than hard errors. */
export function checkSetCookieWarnings(attributes: SetCookieAttributes): readonly string[] {
  const warnings: string[] = [];

  if (attributes.sameSite === 'None' && !attributes.secure) {
    warnings.push('SameSite=None requires the Secure attribute, or modern browsers will reject the cookie.');
  }
  if (attributes.expires !== '' && attributes.maxAge !== '') {
    warnings.push('Both Expires and Max-Age are set — Max-Age takes precedence in modern browsers, making Expires redundant.');
  }
  if (attributes.expires !== '' && Number.isNaN(Date.parse(attributes.expires))) {
    warnings.push('Expires is not a recognizable date/time format.');
  }
  if (attributes.maxAge !== '' && !/^-?\d+$/.test(attributes.maxAge)) {
    warnings.push('Max-Age should be a whole number of seconds.');
  }

  return warnings;
}
