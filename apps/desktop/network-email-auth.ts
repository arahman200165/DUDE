import { createPublicKey } from 'node:crypto';
import { isIP } from 'node:net';
import type { EmailAuthCheck, NetworkRequest } from "@dude/contracts/core/platform/network-types";
import { queryDns } from './network-dns';
import pslData from './data/public-suffix-rules.json';

/**
 * Email Auth Inspector (DUDE_PRD.md §21 Phase 28 items 4–6): SPF (RFC 7208), DKIM key records
 * (RFC 6376 / 8463), and DMARC (RFC 7489). Every DNS query goes through the resolver the user
 * chose; pasted headers are parsed here and never leave the machine — only the derived
 * `<selector>._domainkey.<domain>` lookups do.
 */

export type Finding = { readonly id: string; readonly status: 'pass' | 'warn' | 'fail' | 'info'; readonly title: string; readonly detail?: string; readonly reference?: string };
export type DnsFetcher = (name: string, type: 'TXT' | 'A' | 'AAAA' | 'MX') => Promise<{ rcode: string; values: string[] }>;

export function liveFetcher(request: NetworkRequest, signal: AbortSignal, budget = { used: 0, max: 120 }): DnsFetcher {
  return async (name, type) => {
    if (++budget.used > budget.max) throw new Error(`Query budget of ${budget.max} exceeded.`);
    const result = await queryDns({ kind: 'dns-lookup', target: name, recordType: type, resolver: request.resolver, resolverTransport: request.resolverTransport, timeoutMs: request.timeoutMs }, signal);
    return { rcode: result.rcodeName, values: result.answers.filter((answer) => answer.type === type).map((answer) => answer.value) };
  };
}

// ---- Public Suffix List (organizational domain, RFC 7489 §3.2) ----
const PSL = new Set((pslData as { rules: string[] }).rules);
/** Longest-match PSL lookup (exception and wildcard rules; default rule "*"), plus one label. */
export function organizationalDomain(domain: string): string {
  const labels = domain.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  let suffixLength = 1;
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.');
    if (PSL.has(`!${candidate}`)) { suffixLength = labels.length - i - 1; break; }
    if (PSL.has(candidate) || (i + 1 < labels.length && PSL.has(`*.${labels.slice(i + 1).join('.')}`))) { suffixLength = labels.length - i; break; }
  }
  return labels.slice(Math.max(0, labels.length - suffixLength - 1)).join('.');
}

// ---- SPF ----
export type SpfQualifier = '+' | '-' | '~' | '?';
export interface SpfTerm {
  readonly raw: string;
  readonly kind: 'mechanism' | 'modifier' | 'unknown';
  readonly qualifier?: SpfQualifier;
  readonly name: string;
  readonly value?: string;
  readonly cidr4?: number;
  readonly cidr6?: number;
  readonly error?: string;
}
export function parseSpf(record: string): { terms: SpfTerm[]; errors: string[] } {
  const errors: string[] = [];
  const parts = record.trim().split(/\s+/);
  if (parts[0].toLowerCase() !== 'v=spf1') return { terms: [], errors: ['Record does not start with v=spf1.'] };
  const terms: SpfTerm[] = [];
  for (const raw of parts.slice(1)) {
    const modifier = /^([a-z][a-z0-9_.-]*)=(.*)$/i.exec(raw);
    if (modifier) { terms.push({ raw, kind: 'modifier', name: modifier[1].toLowerCase(), value: modifier[2] }); continue; }
    const match = /^([+\-~?]?)([a-z0-9]+)(?::([^/]*))?(?:\/(\d+))?(?:\/\/(\d+))?$/i.exec(raw);
    if (!match) { terms.push({ raw, kind: 'unknown', name: raw, error: 'Unparseable term.' }); errors.push(`Unparseable term "${raw}".`); continue; }
    const [, qualifier, rawName, value, cidrA, cidrB] = match;
    const name = rawName.toLowerCase();
    let cidr4 = cidrA ? Number(cidrA) : undefined;
    let cidr6 = cidrB ? Number(cidrB) : undefined;
    let error: string | undefined;
    if (name === 'ip6' && cidrA) { cidr6 = Number(cidrA); cidr4 = undefined; }
    if (!['all', 'include', 'a', 'mx', 'ptr', 'ip4', 'ip6', 'exists'].includes(name)) error = `Unknown mechanism "${name}".`;
    else if (['include', 'exists'].includes(name) && !value) error = `${name} requires a domain.`;
    else if (name === 'ip4' && (isIP(value ?? '') !== 4 || (cidr4 !== undefined && cidr4 > 32))) error = `Invalid ip4 value "${raw}".`;
    else if (name === 'ip6' && (isIP(value ?? '') !== 6 || (cidr6 !== undefined && cidr6 > 128))) error = `Invalid ip6 value "${raw}".`;
    else if (name === 'all' && value) error = 'all takes no argument.';
    if (error) errors.push(error);
    terms.push({ raw, kind: 'mechanism', qualifier: (qualifier || '+') as SpfQualifier, name, ...(value !== undefined ? { value } : {}), ...(cidr4 !== undefined ? { cidr4 } : {}), ...(cidr6 !== undefined ? { cidr6 } : {}), ...(error ? { error } : {}) });
  }
  const redirects = terms.filter((term) => term.name === 'redirect');
  if (redirects.length > 1) errors.push('More than one redirect modifier.');
  if (terms.filter((term) => term.name === 'exp').length > 1) errors.push('More than one exp modifier.');
  return { terms, errors };
}

export interface SpfNode {
  readonly domain: string;
  readonly record: string | null;
  readonly terms: readonly (SpfTerm & { readonly lookups?: number; readonly resolved?: readonly string[]; readonly child?: SpfNode; readonly note?: string })[];
  readonly errors: readonly string[];
  readonly lookupCount: number;
}
export interface SpfAnalysis {
  readonly domain: string;
  readonly records: readonly string[];
  readonly tree: SpfNode | null;
  readonly lookupCount: number;
  readonly voidLookups: number;
  readonly flattened: readonly { readonly range: string; readonly qualifier: SpfQualifier; readonly source: string }[];
  readonly evaluation?: { readonly ip: string; readonly result: SpfResult; readonly matched?: string; readonly explanation: string };
  readonly findings: readonly Finding[];
}
export type SpfResult = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'permerror' | 'temperror';
const QUALIFIER_RESULT: Record<SpfQualifier, SpfResult> = { '+': 'pass', '-': 'fail', '~': 'softfail', '?': 'neutral' };

async function spfRecords(fetch: DnsFetcher, domain: string): Promise<{ records: string[]; rcode: string }> {
  const { rcode, values } = await fetch(domain, 'TXT');
  return { rcode, records: values.filter((value) => /^v=spf1(\s|$)/i.test(value.trim())) };
}

/** Recursive include/redirect tree with RFC 7208 §4.6.4 lookup counting (limits are reported, the walk still stops at 20). */
export async function buildSpfTree(fetch: DnsFetcher, domain: string, counters: { lookups: number; voids: number; depth: number; flattened: SpfAnalysis['flattened'][number][] }): Promise<SpfNode> {
  const { records, rcode } = await spfRecords(fetch, domain);
  if (!records.length) return { domain, record: null, terms: [], errors: [rcode === 'NXDOMAIN' ? 'Domain does not exist.' : 'No SPF record.'], lookupCount: 0 };
  if (records.length > 1) return { domain, record: records.join(' | '), terms: [], errors: ['Multiple SPF records: permerror (RFC 7208 §4.5).'], lookupCount: 0 };
  const { terms, errors } = parseSpf(records[0]);
  const out: SpfNode['terms'][number][] = [];
  let lookupCount = 0;
  for (const term of terms) {
    const counts = ['include', 'a', 'mx', 'ptr', 'exists'].includes(term.name) || term.name === 'redirect';
    if (counts) { counters.lookups++; lookupCount++; }
    const target = term.value && !term.value.includes('%') ? term.value : domain;
    if (term.value?.includes('%')) { out.push({ ...term, note: 'Contains macros; expanded only during sender evaluation.' }); continue; }
    if ((term.name === 'include' || term.name === 'redirect') && counters.depth < 20 && counters.lookups <= 20) {
      counters.depth++;
      const child = await buildSpfTree(fetch, target, counters);
      counters.depth--;
      if (!child.record) counters.voids++;
      out.push({ ...term, child });
      continue;
    }
    if (term.name === 'a' || term.name === 'mx') {
      const resolved: string[] = [];
      let hosts = [target];
      if (term.name === 'mx') {
        const mx = await fetch(target, 'MX');
        if (!mx.values.length) counters.voids++;
        hosts = mx.values.map((value) => value.split(' ')[1]?.replace(/\.$/, '') ?? '').filter(Boolean).slice(0, 10);
        if (mx.values.length > 10) errors.push(`${target} has more than 10 MX hosts (RFC 7208 §4.6.4).`);
      }
      for (const host of hosts) {
        for (const type of ['A', 'AAAA'] as const) {
          const answer = await fetch(host, type);
          for (const address of answer.values) {
            const cidr = type === 'A' ? term.cidr4 ?? 32 : term.cidr6 ?? 128;
            resolved.push(`${address}/${cidr}`);
            counters.flattened.push({ range: `${address}/${cidr}`, qualifier: term.qualifier ?? '+', source: `${term.raw} (${domain})` });
          }
        }
      }
      if (term.name === 'a' && !resolved.length) counters.voids++;
      out.push({ ...term, resolved });
      continue;
    }
    if (term.name === 'ip4' || term.name === 'ip6') counters.flattened.push({ range: `${term.value}/${term.name === 'ip4' ? term.cidr4 ?? 32 : term.cidr6 ?? 128}`, qualifier: term.qualifier ?? '+', source: `${domain}` });
    out.push(term);
  }
  return { domain, record: records[0], terms: out, errors, lookupCount };
}

// ---- check_host() ----
function ipToBytes(ip: string): Buffer {
  if (isIP(ip) === 4) return Buffer.from(ip.split('.').map(Number));
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const words = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return Buffer.concat(words.map((word) => { const b = Buffer.alloc(2); b.writeUInt16BE(parseInt(word || '0', 16)); return b; }));
}
export function cidrContains(network: string, bits: number, ip: string): boolean {
  if (isIP(network) !== isIP(ip)) return false;
  const a = ipToBytes(network), b = ipToBytes(ip);
  for (let bit = 0; bit < bits; bit++) {
    const mask = 0x80 >> (bit % 8);
    if ((a[bit >> 3] & mask) !== (b[bit >> 3] & mask)) return false;
  }
  return true;
}

export interface MacroContext { readonly ip: string; readonly sender: string; readonly domain: string; readonly helo?: string }
/** RFC 7208 §7 macro expansion for the common letters (s, l, o, d, i, v, h) with transformers. */
export function expandMacros(input: string, context: MacroContext): string {
  const [local, senderDomain] = context.sender.includes('@') ? context.sender.split('@') : ['postmaster', context.sender];
  return input.replace(/%(%|_|-|\{([slodivhSLODIVH])(\d*)(r?)([.\-+,/_=]*)\})/g, (whole, escape: string, letter?: string, digits?: string, reverse?: string, delimiters?: string) => {
    if (escape === '%') return '%';
    if (escape === '_') return ' ';
    if (escape === '-') return '%20';
    const key = (letter ?? '').toLowerCase();
    let value = key === 's' ? context.sender : key === 'l' ? local : key === 'o' ? senderDomain : key === 'd' ? context.domain
      : key === 'i' ? (isIP(context.ip) === 4 ? context.ip : ipToBytes(context.ip).toString('hex').split('').join('.'))
      : key === 'v' ? (isIP(context.ip) === 4 ? 'in-addr' : 'ip6') : key === 'h' ? context.helo ?? context.domain : whole;
    const split = new RegExp(`[${(delimiters || '.').replace(/[-\]\\/]/g, '\\$&')}]`);
    let parts = value.split(split);
    if (reverse) parts = parts.reverse();
    if (digits) parts = parts.slice(-Math.max(1, Number(digits)));
    value = parts.join('.');
    return letter && letter === letter.toUpperCase() ? encodeURIComponent(value) : value;
  });
}

export async function checkHost(fetch: DnsFetcher, ip: string, domain: string, sender: string, state = { lookups: 0, voids: 0, depth: 0 }): Promise<{ result: SpfResult; matched?: string; explanation: string }> {
  if (state.depth > 10) return { result: 'permerror', explanation: 'Include/redirect nesting too deep.' };
  let records: string[];
  try { records = (await spfRecords(fetch, domain)).records; }
  catch (error) { return { result: 'temperror', explanation: `DNS error for ${domain}: ${error instanceof Error ? error.message : String(error)}` }; }
  if (!records.length) return { result: 'none', explanation: `${domain} publishes no SPF record.` };
  if (records.length > 1) return { result: 'permerror', explanation: `${domain} publishes more than one SPF record.` };
  const { terms, errors } = parseSpf(records[0]);
  if (errors.length) return { result: 'permerror', explanation: `${domain}: ${errors[0]}` };
  const context: MacroContext = { ip, sender, domain };
  const countLookup = (): SpfResult | null => ++state.lookups > 10 ? 'permerror' : null;
  for (const term of terms.filter((entry) => entry.kind === 'mechanism')) {
    const target = term.value ? expandMacros(term.value, context) : domain;
    const hit = (): { result: SpfResult; matched: string; explanation: string } => ({ result: QUALIFIER_RESULT[term.qualifier ?? '+'], matched: `${term.raw} (${domain})`, explanation: `${ip} matched ${term.raw} in ${domain}.` });
    if (['include', 'a', 'mx', 'ptr', 'exists'].includes(term.name) && countLookup()) return { result: 'permerror', explanation: 'More than 10 DNS-querying mechanisms (RFC 7208 §4.6.4).' };
    switch (term.name) {
      case 'all': return hit();
      case 'ip4': case 'ip6': if (cidrContains(term.value!, term.name === 'ip4' ? term.cidr4 ?? 32 : term.cidr6 ?? 128, ip)) return hit(); break;
      case 'a': case 'mx': {
        let hosts = [target];
        if (term.name === 'mx') hosts = (await fetch(target, 'MX')).values.map((value) => value.split(' ')[1]?.replace(/\.$/, '') ?? '').filter(Boolean).slice(0, 10);
        for (const host of hosts) {
          const answer = await fetch(host, isIP(ip) === 4 ? 'A' : 'AAAA');
          if (answer.values.some((address) => cidrContains(address, isIP(ip) === 4 ? term.cidr4 ?? 32 : term.cidr6 ?? 128, ip))) return hit();
        }
        break;
      }
      case 'exists': if ((await fetch(target, 'A')).values.length) return hit(); break;
      case 'ptr': break; // Deprecated (RFC 7208 §5.5); not evaluated.
      case 'include': {
        const inner = await checkHost(fetch, ip, target, sender, { ...state, depth: state.depth + 1 });
        state.lookups = Math.max(state.lookups, (inner as { lookups?: number }).lookups ?? state.lookups);
        if (inner.result === 'pass') return { ...hit(), explanation: `${ip} passed include:${target} (${inner.explanation})` };
        if (inner.result === 'temperror' || inner.result === 'permerror') return inner;
        if (inner.result === 'none') return { result: 'permerror', explanation: `include:${target} has no SPF record.` };
        break;
      }
    }
  }
  const redirect = terms.find((term) => term.name === 'redirect');
  if (redirect?.value) {
    if (countLookup()) return { result: 'permerror', explanation: 'Lookup limit exceeded at redirect.' };
    const inner = await checkHost(fetch, ip, expandMacros(redirect.value, context), sender, { ...state, depth: state.depth + 1 });
    return inner.result === 'none' ? { result: 'permerror', explanation: `redirect=${redirect.value} has no SPF record.` } : inner;
  }
  return { result: 'neutral', explanation: `No mechanism in ${domain} matched ${ip}; the default result is neutral.` };
}

export async function analyzeSpf(fetch: DnsFetcher, domain: string, senderIp?: string): Promise<SpfAnalysis> {
  const counters = { lookups: 0, voids: 0, depth: 0, flattened: [] as SpfAnalysis['flattened'][number][] };
  const { records } = await spfRecords(fetch, domain);
  const tree = records.length ? await buildSpfTree(fetch, domain, counters) : null;
  const findings: Finding[] = [];
  if (!records.length) findings.push({ id: 'spf-none', status: 'fail', title: 'No SPF record', detail: 'Receivers get SPF "none"; publish v=spf1 … -all or ~all.', reference: 'RFC 7208 §4.5' });
  else if (records.length > 1) findings.push({ id: 'spf-multiple', status: 'fail', title: 'Multiple SPF records (permerror)', reference: 'RFC 7208 §4.5' });
  if (tree?.record) {
    const top = parseSpf(tree.record);
    const all = top.terms.find((term) => term.name === 'all');
    const redirect = top.terms.some((term) => term.name === 'redirect');
    if (all?.qualifier === '+') findings.push({ id: 'spf-plus-all', status: 'fail', title: '"+all" authorizes every sender on the Internet' });
    else if (all?.qualifier === '?') findings.push({ id: 'spf-neutral-all', status: 'warn', title: '"?all" gives no protection (neutral)' });
    else if (all?.qualifier === '~') findings.push({ id: 'spf-softfail', status: 'pass', title: 'Ends in ~all (softfail)', detail: 'Pair with DMARC enforcement for rejection.' });
    else if (all?.qualifier === '-') findings.push({ id: 'spf-fail-all', status: 'pass', title: 'Ends in -all (hard fail)' });
    else if (!redirect) findings.push({ id: 'spf-no-all', status: 'warn', title: 'No "all" mechanism or redirect — unmatched senders are neutral' });
    if (top.terms.some((term) => term.name === 'ptr')) findings.push({ id: 'spf-ptr', status: 'warn', title: 'Uses the deprecated ptr mechanism', reference: 'RFC 7208 §5.5' });
    if (Buffer.byteLength(tree.record) > 450) findings.push({ id: 'spf-length', status: 'warn', title: `Record is ${Buffer.byteLength(tree.record)} bytes; long records risk UDP truncation` });
  }
  const collectErrors = (node: SpfNode | undefined | null, out: string[] = []): string[] => { if (!node) return out; out.push(...node.errors.map((error) => `${node.domain}: ${error}`)); node.terms.forEach((term) => collectErrors(term.child, out)); return out; };
  for (const error of collectErrors(tree)) findings.push({ id: `spf-err-${error}`, status: 'fail', title: error });
  findings.push(counters.lookups > 10
    ? { id: 'spf-lookups', status: 'fail', title: `${counters.lookups} DNS-querying terms — exceeds the limit of 10 (permerror)`, reference: 'RFC 7208 §4.6.4' }
    : { id: 'spf-lookups', status: counters.lookups >= 8 ? 'warn' : 'pass', title: `${counters.lookups} of 10 DNS lookups used` });
  if (counters.voids > 2) findings.push({ id: 'spf-voids', status: 'fail', title: `${counters.voids} void lookups — exceeds the limit of 2 (permerror)`, reference: 'RFC 7208 §4.6.4' });
  let evaluation: SpfAnalysis['evaluation'];
  if (senderIp) {
    const outcome = await checkHost(fetch, senderIp, domain, `postmaster@${domain}`);
    evaluation = { ip: senderIp, ...outcome };
    findings.push({ id: 'spf-eval', status: outcome.result === 'pass' ? 'pass' : ['fail', 'permerror'].includes(outcome.result) ? 'fail' : 'warn', title: `check_host(${senderIp}) = ${outcome.result}`, detail: outcome.explanation });
  }
  return { domain, records, tree, lookupCount: counters.lookups, voidLookups: counters.voids, flattened: counters.flattened, ...(evaluation ? { evaluation } : {}), findings };
}

// ---- DKIM ----
export const COMMON_DKIM_SELECTORS: readonly string[] = ['default', 'google', 'selector1', 'selector2', 'k1', 'k2', 'k3', 's1', 's2', 'dkim', 'mail', 'smtp', 'mxvault', 'everlytickey1', 'mandrill', 'pm', 'sig1', 'fm1', 'protonmail', 'zoho'];

export function parseTags(record: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const part of record.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) tags.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).replace(/\s+/g, '').trim());
  }
  return tags;
}

/** Unfold and parse DKIM-Signature headers from pasted message headers (local only). */
export function parseDkimSignatures(headers: string): { domain: string; selector: string; algorithm: string; canonicalization: string; signedHeaders: string; expires?: string; identity?: string }[] {
  const unfolded = headers.replace(/\r?\n[ \t]+/g, ' ');
  return unfolded.split(/\r?\n/).filter((line) => /^dkim-signature\s*:/i.test(line)).map((line) => {
    const tags = parseTags(line.slice(line.indexOf(':') + 1));
    const expires = tags.get('x');
    return {
      domain: (tags.get('d') ?? '').toLowerCase(), selector: (tags.get('s') ?? '').toLowerCase(), algorithm: tags.get('a') ?? '', canonicalization: tags.get('c') ?? 'simple/simple',
      signedHeaders: tags.get('h') ?? '', ...(expires ? { expires: new Date(Number(expires) * 1000).toISOString() } : {}), ...(tags.get('i') ? { identity: tags.get('i') } : {}),
    };
  }).filter((entry) => entry.domain && entry.selector);
}

export interface DkimKeyResult {
  readonly selector: string;
  readonly domain: string;
  readonly name: string;
  readonly source: 'typed' | 'header' | 'guessed';
  readonly found: boolean;
  readonly record?: string;
  readonly keyType?: string;
  readonly keyBits?: number;
  readonly revoked?: boolean;
  readonly testing?: boolean;
  readonly findings: readonly Finding[];
}

export async function inspectDkim(fetch: DnsFetcher, domain: string, selector: string, source: DkimKeyResult['source']): Promise<DkimKeyResult> {
  const name = `${selector}._domainkey.${domain}`;
  const { values } = await fetch(name, 'TXT');
  const record = values.find((value) => /(^|;)\s*(v=DKIM1|p=)/i.test(value)) ?? values[0];
  const findings: Finding[] = [];
  if (!record) return { selector, domain, name, source, found: false, findings: source === 'guessed' ? [] : [{ id: `dkim-missing-${selector}`, status: 'fail', title: `No DKIM key at ${name}` }] };
  const tags = parseTags(record);
  const keyType = (tags.get('k') ?? 'rsa').toLowerCase();
  const p = tags.get('p') ?? '';
  const version = tags.get('v');
  if (version && version !== 'DKIM1') findings.push({ id: `dkim-v-${selector}`, status: 'fail', title: `Unsupported version v=${version}` });
  const flags = (tags.get('t') ?? '').split(':');
  let keyBits: number | undefined;
  if (!p) findings.push({ id: `dkim-revoked-${selector}`, status: 'warn', title: 'Key revoked (empty p=)', detail: 'Signatures with this selector fail verification.' });
  else if (keyType === 'rsa') {
    try {
      const key = createPublicKey({ key: Buffer.from(p, 'base64'), format: 'der', type: 'spki' });
      keyBits = key.asymmetricKeyDetails?.modulusLength;
    } catch {
      try { keyBits = createPublicKey({ key: Buffer.from(p, 'base64'), format: 'der', type: 'pkcs1' }).asymmetricKeyDetails?.modulusLength; }
      catch { findings.push({ id: `dkim-key-${selector}`, status: 'fail', title: 'p= is not a valid RSA public key' }); }
    }
    if (keyBits !== undefined) findings.push(keyBits < 1024 ? { id: `dkim-bits-${selector}`, status: 'fail', title: `RSA key is only ${keyBits} bits`, reference: 'RFC 8301 §3.2' }
      : keyBits < 2048 ? { id: `dkim-bits-${selector}`, status: 'warn', title: `RSA key is ${keyBits} bits; 2048 is recommended`, reference: 'RFC 8301 §3.2' }
        : { id: `dkim-bits-${selector}`, status: 'pass', title: `RSA key is ${keyBits} bits` });
  } else if (keyType === 'ed25519') {
    keyBits = 256;
    findings.push({ id: `dkim-ed-${selector}`, status: Buffer.from(p, 'base64').length === 32 ? 'pass' : 'fail', title: 'Ed25519 key', reference: 'RFC 8463' });
  } else findings.push({ id: `dkim-type-${selector}`, status: 'fail', title: `Unknown key type k=${keyType}` });
  if (flags.includes('y')) findings.push({ id: `dkim-test-${selector}`, status: 'warn', title: 'Testing mode (t=y): receivers may treat failures leniently' });
  if ((tags.get('h') ?? '').split(':').includes('sha1')) findings.push({ id: `dkim-sha1-${selector}`, status: 'warn', title: 'Allows SHA-1 signatures (h=sha1)', reference: 'RFC 8301' });
  return { selector, domain, name, source, found: true, record, keyType, ...(keyBits ? { keyBits } : {}), revoked: !p, testing: flags.includes('y'), findings };
}

// ---- DMARC ----
export interface DmarcAnalysis {
  readonly domain: string;
  readonly queried: readonly string[];
  readonly policyDomain: string | null;
  readonly organizationalDomain: string;
  readonly record: string | null;
  readonly tags: Readonly<Record<string, string>>;
  readonly reportDestinations: readonly { readonly uri: string; readonly kind: 'rua' | 'ruf'; readonly external: boolean; readonly authorized?: boolean; readonly checkedName?: string }[];
  readonly findings: readonly Finding[];
}
export async function analyzeDmarc(fetch: DnsFetcher, domain: string): Promise<DmarcAnalysis> {
  const org = organizationalDomain(domain);
  const queried: string[] = [];
  const findings: Finding[] = [];
  const lookup = async (name: string) => { queried.push(`_dmarc.${name}`); return (await fetch(`_dmarc.${name}`, 'TXT')).values.filter((value) => /^v=DMARC1/i.test(value.trim())); };
  let records = await lookup(domain);
  let policyDomain: string | null = records.length ? domain : null;
  if (!records.length && org !== domain) { records = await lookup(org); if (records.length) policyDomain = org; }
  if (!records.length) {
    findings.push({ id: 'dmarc-none', status: 'fail', title: 'No DMARC record', detail: `Checked ${queried.join(' and ')}.`, reference: 'RFC 7489 §6.6.3' });
    return { domain, queried, policyDomain: null, organizationalDomain: org, record: null, tags: {}, reportDestinations: [], findings };
  }
  if (records.length > 1) findings.push({ id: 'dmarc-multiple', status: 'fail', title: 'Multiple DMARC records — receivers ignore all of them', reference: 'RFC 7489 §6.6.3' });
  const record = records[0];
  const tags = Object.fromEntries(parseTags(record));
  if (policyDomain !== domain) findings.push({ id: 'dmarc-org', status: 'info', title: `Policy inherited from the organizational domain ${org}`, detail: tags['sp'] ? `Subdomain policy sp=${tags['sp']} applies.` : `p=${tags['p']} applies to subdomains (no sp=).` });
  const policy = tags['p'];
  if (!policy || !['none', 'quarantine', 'reject'].includes(policy)) findings.push({ id: 'dmarc-p', status: 'fail', title: `Missing or invalid p= (${policy ?? 'absent'})` });
  else if (policy === 'none') findings.push({ id: 'dmarc-p', status: 'warn', title: 'p=none: monitoring only, no enforcement' });
  else findings.push({ id: 'dmarc-p', status: 'pass', title: `p=${policy}` });
  if (tags['sp'] && !['none', 'quarantine', 'reject'].includes(tags['sp'])) findings.push({ id: 'dmarc-sp', status: 'fail', title: `Invalid sp=${tags['sp']}` });
  if (tags['pct'] && (Number(tags['pct']) < 100)) findings.push({ id: 'dmarc-pct', status: 'warn', title: `pct=${tags['pct']}: the policy applies to only part of failing mail` });
  for (const alignment of ['adkim', 'aspf']) if (tags[alignment] && !['r', 's'].includes(tags[alignment])) findings.push({ id: `dmarc-${alignment}`, status: 'fail', title: `Invalid ${alignment}=${tags[alignment]}` });
  if (!tags['rua']) findings.push({ id: 'dmarc-rua', status: 'info', title: 'No aggregate report address (rua=)' });
  const destinations: DmarcAnalysis['reportDestinations'][number][] = [];
  for (const kind of ['rua', 'ruf'] as const) {
    for (const uri of (tags[kind] ?? '').split(',').map((value) => value.trim()).filter(Boolean)) {
      const host = /^mailto:[^@]+@([^!]+)/i.exec(uri)?.[1]?.toLowerCase();
      if (!host) { destinations.push({ uri, kind, external: false }); findings.push({ id: `dmarc-uri-${uri}`, status: 'warn', title: `${kind} URI is not a mailto: address: ${uri}` }); continue; }
      const external = organizationalDomain(host) !== org;
      if (!external) { destinations.push({ uri, kind, external }); continue; }
      const checkedName = `${policyDomain}._report._dmarc.${host}`;
      const authorized = (await fetch(checkedName, 'TXT')).values.some((value) => /^v=DMARC1/i.test(value.trim()));
      destinations.push({ uri, kind, external, authorized, checkedName });
      if (!authorized) findings.push({ id: `dmarc-ext-${host}`, status: 'warn', title: `External ${kind} destination ${host} has not authorized reports for ${policyDomain}`, detail: `Receivers skip it: no v=DMARC1 TXT at ${checkedName}.`, reference: 'RFC 7489 §7.1' });
    }
  }
  return { domain, queried, policyDomain, organizationalDomain: org, record, tags, reportDestinations: destinations, findings };
}

export interface EmailAuthResult {
  readonly domain: string;
  readonly checks: readonly EmailAuthCheck[];
  readonly spf?: SpfAnalysis;
  readonly dkim?: { readonly keys: readonly DkimKeyResult[]; readonly signatures: ReturnType<typeof parseDkimSignatures>; readonly guessedSelectors?: readonly string[] };
  readonly dmarc?: DmarcAnalysis;
  readonly queries: number;
}

export async function inspectEmailAuth(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void, fetch?: DnsFetcher): Promise<EmailAuthResult> {
  const domain = (request.target ?? '').trim().toLowerCase().replace(/\.$/, '');
  const checks = request.emailChecks ?? ['spf', 'dkim', 'dmarc'];
  const budget = { used: 0, max: 120 };
  const fetcher = fetch ?? liveFetcher(request, signal, budget);
  const result: { -readonly [K in keyof EmailAuthResult]: EmailAuthResult[K] } = { domain, checks, queries: 0 };
  let step = 0;
  if (checks.includes('spf')) { result.spf = await analyzeSpf(fetcher, domain, request.senderIp || undefined); progress(++step, checks.length); }
  if (checks.includes('dkim')) {
    const signatures = request.dkimHeaders ? parseDkimSignatures(request.dkimHeaders) : [];
    const wanted = new Map<string, { domain: string; selector: string; source: DkimKeyResult['source'] }>();
    for (const selector of request.dkimSelectors ?? []) wanted.set(`${selector}|${domain}`, { domain, selector: selector.toLowerCase(), source: 'typed' });
    for (const signature of signatures) if (!wanted.has(`${signature.selector}|${signature.domain}`)) wanted.set(`${signature.selector}|${signature.domain}`, { domain: signature.domain, selector: signature.selector, source: 'header' });
    if (request.dkimCommonProbe) for (const selector of COMMON_DKIM_SELECTORS) if (!wanted.has(`${selector}|${domain}`)) wanted.set(`${selector}|${domain}`, { domain, selector, source: 'guessed' });
    const keys: DkimKeyResult[] = [];
    for (const entry of wanted.values()) {
      if (signal.aborted) throw new Error('Cancelled.');
      keys.push(await inspectDkim(fetcher, entry.domain, entry.selector, entry.source));
    }
    result.dkim = { keys: keys.filter((key) => key.found || key.source !== 'guessed'), signatures, ...(request.dkimCommonProbe ? { guessedSelectors: COMMON_DKIM_SELECTORS } : {}) };
    progress(++step, checks.length);
  }
  if (checks.includes('dmarc')) { result.dmarc = await analyzeDmarc(fetcher, domain); progress(++step, checks.length); }
  result.queries = budget.used;
  return result;
}
