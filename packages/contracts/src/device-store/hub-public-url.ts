/**
 * Strict parser for the Hub's PUBLIC origin typed by the user ("Test from this device"). Shared by the Device Agent (the
 * request is made there) and Electron main (defense in depth before the agent is called): `https:` only, an origin and
 * nothing else (no credentials, path, query or fragment), a DNS name or IP literal, an explicit port of 1-65535.
 * A single trailing `/` is tolerated and dropped.
 */
export const HUB_PUBLIC_URL_MAX_LENGTH = 255;

export type HubPublicUrlResult =
  | { readonly ok: true; readonly origin: string; /** DNS name, IPv4, or bracketed IPv6, lower-case. */ readonly host: string; readonly port: number }
  | { readonly ok: false; readonly error: string };

const fail = (error: string): HubPublicUrlResult => ({ ok: false, error });
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const DNS_NAME = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`);
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_BODY = /^[0-9a-f:.]{2,45}$/;

export function parseHubPublicUrl(input: unknown): HubPublicUrlResult {
  if (typeof input !== 'string' || input.length === 0) return fail('Enter the Hub public address, such as https://hub.example.com.');
  if (input.length > HUB_PUBLIC_URL_MAX_LENGTH) return fail('That address is too long.');
  if (!/^[\x21-\x7e]+$/.test(input)) return fail('That address contains spaces or characters that are not allowed.');
  const scheme = /^https:\/\//i.exec(input);
  if (scheme === null) return fail('The address must start with https://.');
  const rest = input.slice(scheme[0].length);
  const end = rest.search(/[/?#]/);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const tail = end === -1 ? '' : rest.slice(end);
  if (authority.includes('@')) return fail('The address must not contain a user name or password.');
  if (tail.startsWith('?')) return fail('The address must not contain a query string.');
  if (tail.startsWith('#')) return fail('The address must not contain a fragment.');
  if (tail !== '' && tail !== '/') return fail('Enter the origin only, without a path.');
  if (authority.length === 0) return fail('The address has no host.');

  let hostPart: string;
  let portPart: string | undefined;
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    if (close === -1) return fail('The IPv6 address is not closed with ].');
    hostPart = authority.slice(0, close + 1);
    const after = authority.slice(close + 1);
    if (after !== '' && !after.startsWith(':')) return fail('The address is not valid.');
    portPart = after === '' ? undefined : after.slice(1);
    const body = hostPart.slice(1, -1).toLowerCase();
    if (!IPV6_BODY.test(body) || !body.includes(':')) return fail('The IPv6 address is not valid.');
    try {
      void new URL(`https://[${body}]`);
    } catch {
      return fail('The IPv6 address is not valid.');
    }
    hostPart = `[${body}]`;
  } else {
    const colon = authority.indexOf(':');
    hostPart = (colon === -1 ? authority : authority.slice(0, colon)).toLowerCase();
    portPart = colon === -1 ? undefined : authority.slice(colon + 1);
    if (hostPart.includes(':') || hostPart.length === 0) return fail('The address is not valid.');
    const v4 = IPV4.exec(hostPart);
    if (v4 !== null) {
      if (v4.slice(1).some((octet) => Number(octet) > 255 || (octet.length > 1 && octet.startsWith('0')))) return fail('The IPv4 address is not valid.');
    } else {
      const lastLabel = hostPart.slice(hostPart.lastIndexOf('.') + 1);
      if (hostPart.length > 253 || !DNS_NAME.test(hostPart) || /^\d+$/.test(lastLabel)) return fail('The host must be a DNS name or an IP address.');
    }
  }

  let port = 443;
  if (portPart !== undefined) {
    if (!/^\d{1,5}$/.test(portPart)) return fail('The port must be a number from 1 to 65535.');
    port = Number(portPart);
    if (port < 1 || port > 65535) return fail('The port must be a number from 1 to 65535.');
  }
  return { ok: true, host: hostPart, port, origin: `https://${hostPart}${port === 443 ? '' : `:${port}`}` };
}
