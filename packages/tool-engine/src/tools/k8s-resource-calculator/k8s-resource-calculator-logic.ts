/**
 * Pure, framework-free summing of container resource requests/limits across a
 * Pod or Deployment (or DaemonSet/StatefulSet/Job — anything with a `spec.containers`
 * or `spec.template.spec.containers` list) manifest, reusing the Kubernetes Quantity
 * Converter's `parseQuantity` for each container's cpu/memory value.
 */
import { load as loadYaml } from 'js-yaml';
import { parseQuantity } from "../k8s-quantity-converter/k8s-quantity-converter-logic.js";

export interface ContainerResources {
  readonly name: string;
  readonly requestsCpu?: number;
  readonly requestsMemory?: number;
  readonly limitsCpu?: number;
  readonly limitsMemory?: number;
}

function findContainers(doc: Record<string, unknown>): readonly Record<string, unknown>[] {
  const spec = (doc['spec'] ?? {}) as Record<string, unknown>;
  if (Array.isArray(spec['containers'])) return spec['containers'] as Record<string, unknown>[];

  const template = (spec['template'] ?? {}) as Record<string, unknown>;
  const templateSpec = (template['spec'] ?? {}) as Record<string, unknown>;
  if (Array.isArray(templateSpec['containers'])) return templateSpec['containers'] as Record<string, unknown>[];

  return [];
}

function extractQuantity(resources: Record<string, unknown> | undefined, kind: 'requests' | 'limits', key: 'cpu' | 'memory'): number | undefined {
  const bucket = resources?.[kind] as Record<string, unknown> | undefined;
  if (!bucket || typeof bucket[key] !== 'string') return undefined;
  return parseQuantity(bucket[key] as string) ?? undefined;
}

function sum(values: readonly (number | undefined)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export interface ResourceTotals {
  readonly requestsCpu: number;
  readonly requestsMemory: number;
  readonly limitsCpu: number;
  readonly limitsMemory: number;
  readonly containers: readonly ContainerResources[];
}

export type ResourceCalcResult = { readonly ok: true; readonly totals: ResourceTotals } | { readonly ok: false; readonly error: string };

export function calculateResourceRequests(text: string): ResourceCalcResult {
  if (text.trim() === '') return { ok: false, error: 'Enter a Pod, Deployment, or other workload manifest.' };

  let doc: unknown;
  try {
    doc = loadYaml(text);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse YAML.' };
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'A manifest must be a YAML mapping at the top level.' };
  }

  const containersRaw = findContainers(doc as Record<string, unknown>);
  if (containersRaw.length === 0) {
    return { ok: false, error: 'No containers found under spec.containers or spec.template.spec.containers.' };
  }

  const containers: ContainerResources[] = containersRaw.map((container) => {
    const resources = container['resources'] as Record<string, unknown> | undefined;
    return {
      name: String(container['name'] ?? '(unnamed)'),
      requestsCpu: extractQuantity(resources, 'requests', 'cpu'),
      requestsMemory: extractQuantity(resources, 'requests', 'memory'),
      limitsCpu: extractQuantity(resources, 'limits', 'cpu'),
      limitsMemory: extractQuantity(resources, 'limits', 'memory'),
    };
  });

  return {
    ok: true,
    totals: {
      requestsCpu: sum(containers.map((c) => c.requestsCpu)),
      requestsMemory: sum(containers.map((c) => c.requestsMemory)),
      limitsCpu: sum(containers.map((c) => c.limitsCpu)),
      limitsMemory: sum(containers.map((c) => c.limitsMemory)),
      containers,
    },
  };
}
