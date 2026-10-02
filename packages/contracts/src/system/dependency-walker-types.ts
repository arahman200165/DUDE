export interface DependencyForwarderChain {
  readonly symbol: string;
  readonly chain: readonly string[];
  readonly status: 'resolved' | 'missing-module' | 'missing-symbol' | 'architecture-mismatch' | 'api-set-unresolved' | 'sxs-unresolved' | 'cycle' | 'limit' | 'unreadable';
  readonly note?: string;
}

export interface DependencyImportResult {
  readonly name: string;
  readonly delayLoad: boolean;
  readonly status: 'resolved' | 'missing' | 'architecture-mismatch' | 'api-set-unresolved' | 'sxs-unresolved' | 'limit' | 'unreadable';
  readonly path?: string;
  readonly source?: 'known-dll' | 'application' | 'system' | 'windows' | 'path';
  readonly missingSymbols?: readonly string[];
  readonly forwardedSymbols?: readonly { readonly symbol: string; readonly forwarder: string }[];
  readonly forwarderChains?: readonly DependencyForwarderChain[];
  readonly child?: DependencyNode;
  readonly note?: string;
}
export interface DependencyNode {
  readonly path: string;
  readonly name: string;
  readonly machine: 'x86' | 'x64' | 'arm64' | 'unknown';
  readonly depth: number;
  readonly imports: readonly DependencyImportResult[];
  readonly limitations?: readonly string[];
  readonly error?: string;
}
