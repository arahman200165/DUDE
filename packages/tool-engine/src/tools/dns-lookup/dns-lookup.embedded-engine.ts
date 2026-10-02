import type { DnsLookupView } from "@dude/contracts/core/platform/network-live-types";
export function DnsLookupTool_view(result: unknown): DnsLookupView { return result as DnsLookupView; }
export function DnsLookupTool_policyText(policy: string): string {
    return policy === 'unrestricted' ? 'any CA may issue' : policy === 'none-allowed' ? 'no CA may issue' : 'only the listed CAs may issue';
}
