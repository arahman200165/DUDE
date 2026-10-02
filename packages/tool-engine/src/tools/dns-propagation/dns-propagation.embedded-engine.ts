import type { ComparatorEntryView, ComparatorView, DnsLookupView } from "@dude/contracts/core/platform/network-live-types";
export function DnsPropagationTool_view(result: unknown): ComparatorView { return result as ComparatorView; }
export function DnsPropagationTool_lookup(entry: ComparatorEntryView): DnsLookupView | null { return entry.error || !entry.flags ? null : entry as DnsLookupView; }
export function DnsPropagationTool_valuesFor(view: ComparatorView, label: string): readonly string[] {
    return view.comparison.valuesByResolver.find((entry) => entry.label === label)?.values ?? [];
}
export function DnsPropagationTool_isDivergent(view: ComparatorView, label: string, value: string): boolean {
    return view.comparison.onlyIn.some((entry) => entry.label === label && entry.values.includes(value));
}
