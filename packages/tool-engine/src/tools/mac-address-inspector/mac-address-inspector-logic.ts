/**
 * Pure, framework-free MAC address normalization/inspection: format
 * conversion (colon/hyphen/Cisco-dotted/plain), the unicast/multicast and
 * universal/locally-administered bits (the two least-significant bits of the
 * first octet), and an OUI vendor lookup against a small bundled list of
 * common vendors — not the full IEEE registry, to stay dependency-free.
 */

const OUI_VENDORS: Record<string, string> = {
  '00:00:0C': 'Cisco Systems',
  '00:1B:63': 'Apple',
  '3C:22:FB': 'Apple',
  'F4:5C:89': 'Apple',
  '00:50:56': 'VMware',
  '00:0C:29': 'VMware',
  '08:00:27': 'Oracle VirtualBox',
  '52:54:00': 'QEMU/KVM',
  '00:1C:42': 'Parallels',
  'B8:27:EB': 'Raspberry Pi Foundation',
  'DC:A6:32': 'Raspberry Pi Trading',
  '00:15:5D': 'Microsoft (Hyper-V)',
  '00:16:3E': 'Xen',
  '3C:5A:B4': 'Google',
  'F0:9F:C2': 'Ubiquiti Networks',
  'AC:DE:48': 'IEEE documentation-only range',
};

export interface MacInspection {
  readonly colon: string;
  readonly hyphen: string;
  readonly ciscoDotted: string;
  readonly plain: string;
  readonly isMulticast: boolean;
  readonly isLocallyAdministered: boolean;
  readonly vendor?: string;
}

function normalizeToHex12(raw: string): string | null {
  const cleaned = raw.trim().replace(/[:\-.]/g, '');
  return /^[0-9a-fA-F]{12}$/.test(cleaned) ? cleaned.toUpperCase() : null;
}

export function inspectMac(raw: string): MacInspection | null {
  const hex = normalizeToHex12(raw);
  if (!hex) return null;

  const pairs = hex.match(/.{2}/g) as string[];
  const firstByte = parseInt(pairs[0], 16);

  return {
    colon: pairs.join(':'),
    hyphen: pairs.join('-'),
    ciscoDotted: [pairs[0] + pairs[1], pairs[2] + pairs[3], pairs[4] + pairs[5]].join('.').toLowerCase(),
    plain: hex,
    isMulticast: (firstByte & 0x01) === 1,
    isLocallyAdministered: (firstByte & 0x02) === 2,
    vendor: OUI_VENDORS[`${pairs[0]}:${pairs[1]}:${pairs[2]}`],
  };
}
