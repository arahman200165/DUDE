import { buildDependencyTree, buildDependentTree, edgesOfTrees, impactOfStopping, toMermaid } from "./service-graph.js";
import type { ServiceConfig } from "@dude/contracts/system/system-types";

const svc = (name: string, dependencies: string[] = [], dependents: string[] = [], state: ServiceConfig['state'] = 'running'): ServiceConfig => ({
  name, displayName: `${name} display`, description: '', state, type: 'own-process', startType: 'auto', pid: 1, binaryPath: 'x.exe',
  account: 'LocalSystem', canPauseContinue: false, isDriver: false, dependencies, dependents,
});

const configs = [svc('A', ['B'], []), svc('B', ['C'], ['A']), svc('C', [], ['B'])];
const resolve = (n: string) => configs.find((c) => c.name === n);

describe('service-graph', () => {
  it('builds the dependency tree', () => {
    const tree = buildDependencyTree(configs[0], resolve);
    expect(tree.children.map((c) => c.name)).toEqual(['B']);
    expect(tree.children[0].children.map((c) => c.name)).toEqual(['C']);
  });

  it('builds the dependent tree', () => {
    const tree = buildDependentTree(configs[2], resolve);
    expect(tree.children[0].name).toBe('B');
    expect(tree.children[0].children[0].name).toBe('A');
  });

  it('is cycle-safe', () => {
    const cyc = [svc('X', ['Y'], ['Y']), svc('Y', ['X'], ['X'])];
    const find = (n: string) => cyc.find((c) => c.name === n);
    const tree = buildDependencyTree(cyc[0], find);
    expect(tree.children[0].children[0]).toMatchObject({ name: 'X', cycle: true, children: [] });
    expect(buildDependentTree(cyc[0], find).children[0].children[0].cycle).toBe(true);
    expect(impactOfStopping('X', cyc)).toEqual(['Y']);
  });

  it('marks unresolvable services as missing', () => {
    const tree = buildDependencyTree(svc('A', ['Ghost']), () => undefined);
    expect(tree.children[0]).toMatchObject({ name: 'Ghost', missing: true });
  });

  it('computes the transitive stop impact, skipping stopped dependents', () => {
    expect(impactOfStopping('C', configs)).toEqual(['B', 'A']);
    expect(impactOfStopping('A', configs)).toEqual([]);
    const withStopped = [svc('A', ['B'], [], 'stopped'), configs[1], configs[2]];
    expect(impactOfStopping('C', withStopped)).toEqual(['B']);
  });

  it('finds dependents from dependency lists alone', () => {
    expect(impactOfStopping('C', [svc('B', ['C']), svc('A', ['B'])])).toEqual(['B', 'A']);
  });

  it('renders mermaid', () => {
    const edges = edgesOfTrees(buildDependencyTree(configs[1], resolve), buildDependentTree(configs[1], resolve));
    expect(edges).toEqual([{ from: 'B', to: 'C' }, { from: 'A', to: 'B' }]);
    const text = toMermaid('B', edges);
    expect(text.startsWith('graph LR')).toBe(true);
    expect(text).toContain('n0["B"]');
    expect(text).toContain('n0 --> n1');
    expect(text).toContain('n2 --> n0');
  });

  it('escapes quotes in mermaid labels', () => {
    expect(toMermaid('a"b', [])).toContain('#quot;');
  });
});
