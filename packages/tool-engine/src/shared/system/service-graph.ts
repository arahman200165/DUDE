/**
 * Pure service dependency-graph helpers (Phase 31 Milestone 602). No Angular, no I/O: the tool
 * supplies the configs it has read. Every walk is cycle-safe and tolerates services it cannot resolve.
 */
import type { ServiceConfig, ServiceState } from "@dude/contracts/system/system-types";

export type ServiceResolver = (name: string) => ServiceConfig | undefined;

export interface ServiceGraphNode {
  readonly name: string;
  readonly displayName: string;
  readonly state?: ServiceState;
  /** True when the resolver had no config for this name, so its own edges are unknown. */
  readonly missing: boolean;
  /** True when this name already appears above it on the path (the walk stops here). */
  readonly cycle: boolean;
  readonly children: readonly ServiceGraphNode[];
}

export interface ServiceEdge {
  /** The service that depends on `to`. */
  readonly from: string;
  readonly to: string;
}

const key = (name: string): string => name.toLowerCase();

function walk(name: string, resolve: ServiceResolver, next: (c: ServiceConfig) => readonly string[], path: ReadonlySet<string>): ServiceGraphNode {
  const config = resolve(name);
  if (path.has(key(name))) {
    return { name, displayName: config?.displayName ?? name, state: config?.state, missing: !config, cycle: true, children: [] };
  }
  if (!config) return { name, displayName: name, missing: true, cycle: false, children: [] };
  const inner = new Set(path).add(key(name));
  return {
    name: config.name, displayName: config.displayName, state: config.state, missing: false, cycle: false,
    children: next(config).map((child) => walk(child, resolve, next, inner)),
  };
}

/** The services `config` needs (its dependencies), recursively. The root is `config` itself. */
export function buildDependencyTree(config: ServiceConfig, resolve: ServiceResolver): ServiceGraphNode {
  const resolver: ServiceResolver = (n) => (key(n) === key(config.name) ? config : resolve(n));
  return walk(config.name, resolver, (c) => c.dependencies, new Set());
}

/** The services that need `config` (its dependents), recursively. The root is `config` itself. */
export function buildDependentTree(config: ServiceConfig, resolve: ServiceResolver): ServiceGraphNode {
  const resolver: ServiceResolver = (n) => (key(n) === key(config.name) ? config : resolve(n));
  return walk(config.name, resolver, (c) => c.dependents, new Set());
}

/**
 * The transitive dependents that would also stop if `name` stopped, breadth-first, excluding `name`
 * itself and any dependent known to be stopped already. Dependents are read from both directions
 * (`dependents` lists and other services' `dependencies`) so a partial snapshot still finds them.
 */
export function impactOfStopping(name: string, allConfigs: readonly ServiceConfig[]): readonly string[] {
  const byName = new Map(allConfigs.map((c) => [key(c.name), c]));
  const reverse = new Map<string, Set<string>>();
  const link = (dependency: string, dependent: string): void => {
    const set = reverse.get(key(dependency)) ?? new Set<string>();
    set.add(dependent);
    reverse.set(key(dependency), set);
  };
  for (const c of allConfigs) {
    for (const d of c.dependents) link(c.name, d);
    for (const d of c.dependencies) link(d, c.name);
  }
  const seen = new Set<string>([key(name)]);
  const out: string[] = [];
  const queue: string[] = [name];
  while (queue.length) {
    const current = queue.shift()!;
    for (const dependent of reverse.get(key(current)) ?? []) {
      if (seen.has(key(dependent))) continue;
      seen.add(key(dependent));
      const known = byName.get(key(dependent));
      if (known?.state === 'stopped') continue; // already stopped: nothing further stops through it
      out.push(known?.name ?? dependent);
      queue.push(dependent);
    }
  }
  return out;
}

/** Every `from depends on to` edge of a tree pair (dependencies point down, dependents point up), de-duplicated. */
export function edgesOfTrees(dependencies: ServiceGraphNode, dependents: ServiceGraphNode): readonly ServiceEdge[] {
  const seen = new Set<string>();
  const edges: ServiceEdge[] = [];
  const add = (from: string, to: string): void => {
    const id = `${key(from)}>${key(to)}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ from, to });
  };
  const down = (node: ServiceGraphNode): void => { for (const c of node.children) { add(node.name, c.name); down(c); } };
  const up = (node: ServiceGraphNode): void => { for (const c of node.children) { add(c.name, node.name); up(c); } };
  down(dependencies);
  up(dependents);
  return edges;
}

/** A Mermaid `graph LR` of the dependency graph; arrows run from a service to what it depends on. */
export function toMermaid(rootName: string, edges: readonly ServiceEdge[]): string {
  const ids = new Map<string, string>();
  const names: string[] = [];
  const id = (name: string): string => {
    const k = key(name);
    let value = ids.get(k);
    if (!value) { value = `n${ids.size}`; ids.set(k, value); names.push(name); }
    return value;
  };
  const label = (name: string): string => name.replace(/"/g, '#quot;');
  id(rootName);
  const lines = edges.map((e) => `  ${id(e.from)} --> ${id(e.to)}`);
  const nodes = names.map((n) => `  ${id(n)}["${label(n)}"]`);
  return ['graph LR', ...nodes, ...lines, `  style ${id(rootName)} stroke-width:3px`].join('\n');
}
