import { PanelNode } from './workspace.model';

/**
 * A named, saved arrangement of tools/panels (DUDE_PRD.md §21 Phase 24 Item 11) — exactly
 * `WorkspaceLayout` minus `focusedNodeId` (which leaf has focus is a live-session detail, not part
 * of the arrangement itself). Built-in templates are curated data, mirroring `PASTE_DETECTORS`'s
 * "data, not control flow" shape — see `AGENTS.md` in this directory.
 */
export interface WorkspaceTemplate {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly builtIn: boolean;
  readonly panelTree: PanelNode | null;
  readonly openTabs: readonly string[];
}

function threeToolLayout(id: string, toolIds: readonly [string, string, string]): Pick<WorkspaceTemplate, 'panelTree' | 'openTabs'> {
  const [a, b, c] = toolIds;
  const panelTree: PanelNode = {
    kind: 'split',
    nodeId: `${id}-split-root`,
    ratio: 0.4,
    a: { kind: 'leaf', nodeId: `${id}-leaf-a`, toolId: a },
    b: {
      kind: 'split',
      nodeId: `${id}-split-right`,
      ratio: 0.5,
      a: { kind: 'leaf', nodeId: `${id}-leaf-b`, toolId: b },
      b: { kind: 'leaf', nodeId: `${id}-leaf-c`, toolId: c },
    },
  };
  return { panelTree, openTabs: toolIds };
}

export const WORKSPACE_TEMPLATE_STORE_SCHEMA_VERSION = 1;

export interface WorkspaceTemplateStore {
  readonly schemaVersion: 1;
  readonly userTemplates: readonly WorkspaceTemplate[];
}

export const EMPTY_WORKSPACE_TEMPLATE_STORE: WorkspaceTemplateStore = { schemaVersion: 1, userTemplates: [] };

/** Defensive parse: unrecognized/corrupt persisted data resets to an empty store rather than throwing. */
export function migrateWorkspaceTemplateStore(raw: unknown): WorkspaceTemplateStore {
  if (!raw || typeof raw !== 'object') return EMPTY_WORKSPACE_TEMPLATE_STORE;
  const candidate = raw as Partial<WorkspaceTemplateStore>;
  if (candidate.schemaVersion === WORKSPACE_TEMPLATE_STORE_SCHEMA_VERSION && Array.isArray(candidate.userTemplates)) {
    return { schemaVersion: 1, userTemplates: candidate.userTemplates };
  }
  return EMPTY_WORKSPACE_TEMPLATE_STORE;
}

export function createWorkspaceTemplate(name: string, panelTree: PanelNode | null, openTabs: readonly string[]): WorkspaceTemplate {
  return { id: crypto.randomUUID(), name, builtIn: false, panelTree, openTabs };
}

export const BUILT_IN_TEMPLATES: readonly WorkspaceTemplate[] = [
  {
    id: 'api-debugging',
    name: 'API Debugging',
    description: 'Build a request, convert it to/from curl, and inspect the JSON response.',
    builtIn: true,
    ...threeToolLayout('api-debugging', ['http-request-builder', 'curl-converter', 'json']),
  },
  {
    id: 'jwt-auth',
    name: 'JWT / Auth',
    description: 'Decode a JWT, inspect its signing keys, and check an OAuth access token.',
    builtIn: true,
    ...threeToolLayout('jwt-auth', ['jwt', 'jwks-viewer', 'oauth-token-inspector']),
  },
  {
    id: 'data-cleanup',
    name: 'Data Cleanup',
    description: 'View a CSV, trim/normalize it, then remove duplicate rows.',
    builtIn: true,
    ...threeToolLayout('data-cleanup', ['csv-viewer', 'csv-cleaner', 'csv-dedupe']),
  },
  {
    id: 'certificate-inspection',
    name: 'Certificate Inspection',
    description: 'Inspect a certificate chain, a CSR, and a JWKS side by side.',
    builtIn: true,
    ...threeToolLayout('certificate-inspection', ['certificate-chain-tools', 'csr-generator-inspector', 'jwks-to-pem']),
  },
];
