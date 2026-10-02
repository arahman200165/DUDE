import { promises as fs } from 'node:fs';
import { parsePeHeaders, type PeExport, type PeImportSymbol } from "@dude/tool-engine/shared/pe/pe-parser";
import type { DllSearchContext, DllSearchSource } from "@dude/tool-engine/shared/system/dll-search-order";
import { planDllSearch } from "@dude/tool-engine/shared/system/dll-search-order";

export interface DependencyPeImport {
  readonly name: string;
  readonly delayLoad?: boolean;
  readonly symbols?: readonly ({ readonly name: string } | { readonly ordinal: number })[];
}
export interface DependencyPeExport {
  readonly name?: string;
  readonly ordinal: number;
  readonly forwardedTo?: string;
}
export interface DependencyPeImage {
  readonly machine: 'x86' | 'x64' | 'arm64' | 'unknown';
  readonly imports: readonly DependencyPeImport[];
  readonly exports?: readonly DependencyPeExport[];
}
export type DependencyPeParser = (header: Uint8Array, filePath: string) => DependencyPeImage;
export interface DependencyWalkerOptions {
  readonly search: DllSearchContext;
  readonly parsePe?: DependencyPeParser;
  readonly maxDepth?: number;
  readonly maxModules?: number;
  readonly maxHeaderBytes?: number;
}
export interface DependencyNode {
  readonly path: string;
  readonly name: string;
  readonly machine: DependencyPeImage['machine'];
  readonly depth: number;
  readonly imports: readonly DependencyImportResult[];
  readonly limitations?: readonly string[];
  readonly error?: string;
}
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
  readonly source?: DllSearchSource;
  readonly missingSymbols?: readonly string[];
  readonly forwardedSymbols?: readonly { readonly symbol: string; readonly forwarder: string }[];
  readonly forwarderChains?: readonly DependencyForwarderChain[];
  readonly child?: DependencyNode;
  readonly note?: string;
}

const DEFAULT_HEADER_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_MODULES = 512;

function machineName(machine: string): DependencyPeImage['machine'] {
  if (['i386', 'x86'].includes(machine.toLowerCase())) return 'x86';
  if (machine.toLowerCase().includes('amd64') || machine.toLowerCase() === 'x64') return 'x64';
  if (['arm64', 'aa64'].includes(machine.toLowerCase())) return 'arm64';
  return 'unknown';
}
function importSymbol(symbol: PeImportSymbol): { readonly name: string } | { readonly ordinal: number } | undefined {
  if (symbol.name !== null) return { name: symbol.name };
  if (symbol.ordinal !== null) return { ordinal: symbol.ordinal };
  return undefined;
}
function exportSymbol(entry: PeExport): DependencyPeExport {
  return { ...(entry.name ? { name: entry.name } : {}), ordinal: entry.ordinal, ...(entry.forwardedTo ? { forwardedTo: entry.forwardedTo } : {}) };
}
export function parseDependencyPe(header: Uint8Array): DependencyPeImage {
  const report = parsePeHeaders(header);
  if (!report.isPe) throw new Error(report.error);
  const modules = [
    ...report.importModules.map((module) => ({ module, delayLoad: false })),
    ...report.delayLoadImports.map((module) => ({ module, delayLoad: true })),
  ];
  return {
    machine: machineName(report.machine),
    imports: modules.map(({ module, delayLoad }) => ({
      name: module.dll,
      delayLoad,
      symbols: module.symbols.map(importSymbol).filter((symbol): symbol is NonNullable<typeof symbol> => !!symbol),
    })),
    exports: report.exports.map(exportSymbol),
  };
}

const MODULE_EXTENSION = /\.(?:dll|exe|sys|drv|ocx|cpl|scr|ax)$/i;
/**
 * Only absolute drive-letter module paths (or, for the user-picked root only, a plain UNC share
 * path) are ever opened. Device paths, relative/traversing paths and non-module
 * extensions are refused, since import names come from untrusted PE files.
 */
export function isSafeModulePath(path: string, allowUnc = false): boolean {
  if (path.length > 32767 || /[\u0000-\u001f\u007f]/.test(path)) return false;
  const value = path.replace(/\//g, '\\');
  if (/^\\\\[?.]\\/.test(value)) return false;
  const drive = /^[A-Za-z]:\\/.test(value);
  const unc = allowUnc && /^\\\\[^\\?.][^\\]*\\[^\\]+\\/.test(value);
  if (!drive && !unc) return false;
  if (value.split('\\').includes('..')) return false;
  return MODULE_EXTENSION.test(value);
}

async function readHeaderOnly(filePath: string, cap: number): Promise<Uint8Array> {
  if (!isSafeModulePath(filePath, true)) throw new Error('Refusing to read a non-module, device, or relative path.');
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Not a regular file.');
    const length = Math.min(stat.size, cap);
    const bytes = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const { bytesRead } = await handle.read(bytes, offset, length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    return bytes.subarray(0, offset);
  } finally {
    await handle.close();
  }
}
function basename(path: string): string {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf(String.fromCharCode(92)));
  return path.slice(separator + 1);
}
function machineMismatch(target: DependencyPeImage['machine'], actual: DependencyPeImage['machine']): boolean {
  return target !== 'unknown' && actual !== 'unknown' && target !== actual;
}
function symbolKey(symbol: { readonly name: string } | { readonly ordinal: number }): string {
  return 'name' in symbol ? symbol.name : '#' + symbol.ordinal;
}
function importedSymbolKeys(imported: DependencyPeImport): string[] {
  return (imported.symbols ?? []).map(symbolKey);
}

/**
 * Recursively inspect imports using bounded PE header reads. Root selection is expected to come
 * from Electron's picker. SxS activation-context resolution is an explicit limitation.
 */
export async function walkDependencies(rootPath: string, options: DependencyWalkerOptions): Promise<DependencyNode> {
  const maxDepth = Math.max(0, Math.min(options.maxDepth ?? DEFAULT_MAX_DEPTH, 64));
  const maxModules = Math.max(1, Math.min(options.maxModules ?? DEFAULT_MAX_MODULES, 2048));
  const maxHeaderBytes = Math.max(64 * 1024, Math.min(options.maxHeaderBytes ?? DEFAULT_HEADER_BYTES, 16 * 1024 * 1024));
  if (!isSafeModulePath(rootPath, true)) throw new Error('Choose an absolute .exe or .dll path (device paths are not allowed).');
  const parsePe = options.parsePe ?? ((header: Uint8Array) => parseDependencyPe(header));
  const seen = new Map<string, DependencyNode>();
  const parsed = new Map<string, DependencyPeImage>();
  let moduleCount = 0;
  let targetArchitecture = options.search.targetArchitecture;

  const resolveForwarder = async (
    sourceSymbol: string, forwarder: string, depth: number,
    ancestry: ReadonlySet<string>, chain: readonly string[],
  ): Promise<DependencyForwarderChain> => {
    const separator = forwarder.lastIndexOf('.')
    if (separator <= 0 || separator === forwarder.length - 1) return { symbol: sourceSymbol, chain, status: 'unreadable', note: `Malformed forwarder: ${forwarder}` }
    const rawModule = forwarder.slice(0, separator)
    const targetSymbol = forwarder.slice(separator + 1)
    const moduleName = /\.dll$/i.test(rawModule) ? rawModule : `${rawModule}.dll`
    const nextChainName = `${moduleName}!${targetSymbol}`
    if (depth >= maxDepth) return { symbol: sourceSymbol, chain: [...chain, nextChainName], status: 'limit', note: 'Maximum forwarder-chain depth reached.' }
    const search = planDllSearch(moduleName, { ...options.search, targetArchitecture })
    if (search.sxsUnresolved) return { symbol: sourceSymbol, chain: [...chain, nextChainName], status: 'sxs-unresolved', note: 'Side-by-side forwarder resolution is not implemented.' }
    if (search.apiSet && !search.apiSetResolved) return { symbol: sourceSymbol, chain: [...chain, nextChainName], status: 'api-set-unresolved', note: 'No API-set host mapping was available.' }
    let resolved: { path: string; source: DllSearchSource } | undefined
    for (const candidate of search.candidates) {
      if (!isSafeModulePath(candidate.path)) continue;
      try { if ((await fs.stat(candidate.path)).isFile()) { resolved = candidate; break } } catch { /* Try the next search location. */ }
    }
    if (!resolved) return { symbol: sourceSymbol, chain: [...chain, nextChainName], status: 'missing-module', note: `Forwarder module ${moduleName} was not found.` }
    const identity = `${resolved.path.toLowerCase()}!${targetSymbol.toLowerCase()}`
    const nextChain = [...chain, `${basename(resolved.path)}!${targetSymbol}`]
    if (ancestry.has(identity)) return { symbol: sourceSymbol, chain: nextChain, status: 'cycle', note: 'Forwarder cycle detected.' }
    let targetImage = parsed.get(resolved.path.toLowerCase())
    if (!targetImage) {
      if (moduleCount >= maxModules) return { symbol: sourceSymbol, chain: nextChain, status: 'limit', note: 'Maximum module count reached while following a forwarder.' }
      moduleCount++
      try { targetImage = parsePe(await readHeaderOnly(resolved.path, maxHeaderBytes), resolved.path); parsed.set(resolved.path.toLowerCase(), targetImage) }
      catch (error) { return { symbol: sourceSymbol, chain: nextChain, status: 'unreadable', note: error instanceof Error ? error.message : String(error) } }
    }
    if (machineMismatch(targetArchitecture, targetImage.machine)) return { symbol: sourceSymbol, chain: nextChain, status: 'architecture-mismatch', note: `Forwarder target architecture ${targetImage.machine} does not match ${targetArchitecture}.` }
    if (!targetImage.exports) return { symbol: sourceSymbol, chain: nextChain, status: 'unreadable', note: 'Forwarder target exports could not be inspected.' }
    const targetExport = targetImage.exports.find((entry) => (entry.name && entry.name === targetSymbol) || `#${entry.ordinal}` === targetSymbol)
    if (!targetExport) return { symbol: sourceSymbol, chain: nextChain, status: 'missing-symbol', note: `Forwarder target symbol ${targetSymbol} is missing from ${moduleName}.` }
    if (!targetExport.forwardedTo) return { symbol: sourceSymbol, chain: nextChain, status: 'resolved' }
    const nextAncestry = new Set(ancestry); nextAncestry.add(identity)
    return resolveForwarder(targetSymbol, targetExport.forwardedTo, depth + 1, nextAncestry, nextChain)
  }

  const visit = async (filePath: string, depth: number): Promise<DependencyNode> => {
    const cacheKey = filePath.toLowerCase();
    const cached = seen.get(cacheKey);
    if (cached) return cached;
    moduleCount++;
    const name = basename(filePath);
    if (moduleCount > maxModules) return { path: filePath, name, machine: 'unknown', depth, imports: [], error: 'Module limit reached.' };

    let image: DependencyPeImage;
    try {
      image = parsePe(await readHeaderOnly(filePath, maxHeaderBytes), filePath);
      parsed.set(cacheKey, image);
    } catch (error) {
      const failed: DependencyNode = { path: filePath, name, machine: 'unknown', depth, imports: [], error: error instanceof Error ? error.message : String(error) };
      seen.set(cacheKey, failed);
      return failed;
    }
    if (depth === 0 && image.machine !== 'unknown') targetArchitecture = image.machine;

    const node: DependencyNode = { path: filePath, name, machine: image.machine, depth, imports: [], limitations: ['SxS activation-context dependency resolution is not implemented.'] };
    seen.set(cacheKey, node);
    const importResults: DependencyImportResult[] = [];

    for (const imported of image.imports) {
      const search = planDllSearch(imported.name, { ...options.search, targetArchitecture });
      if (search.sxsUnresolved) {
        importResults.push({ name: imported.name, delayLoad: !!imported.delayLoad, status: 'sxs-unresolved', note: 'Side-by-side manifest/activation-context resolution is not implemented.' });
        continue;
      }
      if (search.apiSet && !search.apiSetResolved) {
        importResults.push({ name: imported.name, delayLoad: !!imported.delayLoad, status: 'api-set-unresolved', note: 'No host mapping was available in the helper API-set map.' });
        continue;
      }

      let resolved: { path: string; source: DllSearchSource } | undefined;
      for (const candidate of search.candidates) {
        if (!isSafeModulePath(candidate.path)) continue;
        try { if ((await fs.stat(candidate.path)).isFile()) { resolved = candidate; break; } } catch { /* Try the next search location. */ }
      }
      if (!resolved) {
        importResults.push({ name: imported.name, delayLoad: !!imported.delayLoad, status: 'missing' });
        continue;
      }
      if (depth >= maxDepth && !seen.has(resolved.path.toLowerCase())) {
        importResults.push({ name: imported.name, delayLoad: !!imported.delayLoad, status: 'limit', path: resolved.path, source: resolved.source, note: 'Maximum dependency depth reached.' });
        continue;
      }

      const child = await visit(resolved.path, depth + 1);
      if (child.error) {
        importResults.push({ name: imported.name, delayLoad: !!imported.delayLoad, status: 'unreadable', path: resolved.path, source: resolved.source, child, note: child.error });
        continue;
      }
      if (machineMismatch(targetArchitecture, child.machine)) {
        importResults.push({ name: imported.name, delayLoad: !!imported.delayLoad, status: 'architecture-mismatch', path: resolved.path, source: resolved.source, child });
        continue;
      }
      const childImage = parsed.get(child.path.toLowerCase());
      const exports = childImage?.exports ?? [];
      const exported = new Set<string>();
      const exportedByName = new Map<string, DependencyPeExport>();
      for (const entry of exports) {
        if (entry.name) { exported.add(entry.name); exportedByName.set(entry.name, entry); }
        exported.add('#' + entry.ordinal);
        exportedByName.set('#' + entry.ordinal, entry);
      }
      const symbols = importedSymbolKeys(imported);
      const missingSymbols = childImage?.exports !== undefined ? symbols.filter((symbol) => !exported.has(symbol)) : [];
      const forwardedSymbols = symbols.flatMap((symbol) => {
        const forwarder = exportedByName.get(symbol)?.forwardedTo;
        return forwarder ? [{ symbol, forwarder }] : [];
      });
      const forwarderChains = await Promise.all(forwardedSymbols.map(async ({ symbol, forwarder }) => {
        const chain = await resolveForwarder(symbol, forwarder, 0, new Set([`${child.path.toLowerCase()}!${symbol.toLowerCase()}`]), [`${child.name}!${symbol}`]);
        return { ...chain, symbol };
      }));
      importResults.push({
        name: imported.name, delayLoad: !!imported.delayLoad, status: 'resolved', path: resolved.path,
        source: resolved.source, ...(missingSymbols.length ? { missingSymbols } : []),
        ...(forwardedSymbols.length ? { forwardedSymbols } : []), ...(forwarderChains.length ? { forwarderChains } : []), child,
      });
    }
    const final: DependencyNode = { ...node, imports: importResults };
    seen.set(cacheKey, final);
    return final;
  };

  return visit(rootPath, 0);
}

