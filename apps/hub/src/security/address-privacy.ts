import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';

export const AUDIT_IP_MODES = ['full', 'truncated'] as const;
export type AuditIpMode = (typeof AUDIT_IP_MODES)[number];
const META_KEY = 'audit_ip_mode';

export function isAuditIpMode(value: unknown): value is AuditIpMode {
  return typeof value === 'string' && (AUDIT_IP_MODES as readonly string[]).includes(value);
}

export function getAuditIpMode(db: Db): AuditIpMode {
  const value = getMeta(db, META_KEY);
  return isAuditIpMode(value) ? value : 'full';
}

export function setAuditIpMode(db: Db, mode: AuditIpMode): void {
  setMeta(db, META_KEY, mode);
}

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseV4(text: string): number[] | null {
  const m = V4.exec(text);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

function parseV6(text: string): number[] | null {
  const bare = text.split('%')[0] ?? '';
  const halves = bare.split('::');
  if (halves.length > 2) return null;
  const expand = (side: string): number[] | null => {
    if (side === '') return [];
    const out: number[] = [];
    const groups = side.split(':');
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i] as string;
      const v4 = i === groups.length - 1 ? parseV4(g) : null;
      if (v4) { out.push(v4[0]! * 256 + v4[1]!, v4[2]! * 256 + v4[3]!); continue; }
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = expand(halves[0] as string);
  const tail = halves.length === 2 ? expand(halves[1] as string) : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing >= 1 ? [...head, ...new Array<number>(missing).fill(0), ...tail] : null;
}

function formatV6(h: number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8;) {
    if (h[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && h[j] === 0) j++;
    if (j - i > bestLen) { bestStart = i; bestLen = j - i; }
    i = j;
  }
  const hex = (n: number): string => n.toString(16);
  if (bestLen < 2) return h.map(hex).join(':');
  const left = h.slice(0, bestStart).map(hex).join(':');
  const right = h.slice(bestStart + bestLen).map(hex).join(':');
  return `${left}::${right}`;
}

/** Truncated form of an address: IPv4 `a.b.c.0`, IPv6 the first 3 hextets then `::`; mapped IPv4 is treated as IPv4. */
export function truncateAddress(ip: string): string {
  if (ip === 'unknown') return ip;
  const lower = ip.trim().toLowerCase();
  const v4 = parseV4(lower.startsWith('::ffff:') ? lower.slice(7) : lower);
  if (v4) return `${v4[0]}.${v4[1]}.${v4[2]}.0`;
  const v6 = parseV6(lower);
  if (!v6) return 'unknown';
  const mapped = v6.slice(0, 5).every((x) => x === 0) && v6[5] === 0xffff;
  if (mapped) return `${v6[6]! >> 8}.${v6[6]! & 255}.${v6[7]! >> 8}.0`;
  return formatV6([v6[0]!, v6[1]!, v6[2]!, 0, 0, 0, 0, 0]);
}

/** The address as it may be stored in audit rows and session records (never used for throttle or block keys). */
export function maskAddress(db: Db, ip: string | undefined): string | undefined {
  if (ip === undefined || ip === 'unknown') return ip;
  return getAuditIpMode(db) === 'truncated' ? truncateAddress(ip) : ip;
}
