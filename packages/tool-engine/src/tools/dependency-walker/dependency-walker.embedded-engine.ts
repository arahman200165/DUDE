import type { DependencyImportResult, DependencyNode } from "@dude/contracts/system/dependency-walker-types";
export function DependencyWalkerTool_details(item: DependencyImportResult): string {
    const chains = item.forwarderChains?.map((chain) => 'Forwarder chain (' + chain.status + '): ' + chain.chain.join(' → ') + (chain.note ? ' · ' + chain.note : '')) ?? [];
    return [item.delayLoad ? 'Delay-load' : undefined, item.source, ...(item.missingSymbols?.length ? ['Missing symbols: ' + item.missingSymbols.join(', ')] : []), ...(item.forwardedSymbols?.length ? ['Forwarded: ' + item.forwardedSymbols.map((value) => value.symbol + ' → ' + value.forwarder).join(', ')] : []), ...chains, item.note].filter(Boolean).join(' · ');
}
