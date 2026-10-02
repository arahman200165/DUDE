import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';
import {
  BUILT_IN_TEMPLATES,
  EMPTY_WORKSPACE_TEMPLATE_STORE,
  WorkspaceTemplateStore,
  createWorkspaceTemplate,
  migrateWorkspaceTemplateStore,
} from "@dude/domain/core/workspace/workspace-template.model";
import { findLeafByToolId } from "@dude/domain/core/workspace/workspace.model";

describe('BUILT_IN_TEMPLATES', () => {
  const knownIds = new Set(TOOL_DEFINITIONS.map((tool) => tool.id));

  it('has at least one built-in template', () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('has no duplicate template ids', () => {
    const ids = BUILT_IN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const template of BUILT_IN_TEMPLATES) {
    it(`"${template.name}" only references tool ids that resolve in the real registry`, () => {
      for (const toolId of template.openTabs) {
        expect(knownIds.has(toolId), `"${template.name}" references unknown tool id "${toolId}"`).toBe(true);
      }
    });

    it(`"${template.name}"'s panelTree contains a leaf for every openTabs entry`, () => {
      for (const toolId of template.openTabs) {
        expect(findLeafByToolId(template.panelTree, toolId), `no panel leaf found for "${toolId}"`).not.toBeNull();
      }
    });
  }
});

describe('createWorkspaceTemplate', () => {
  it('creates a non-built-in template with a fresh id', () => {
    const template = createWorkspaceTemplate('My Layout', null, ['base64']);
    expect(template.builtIn).toBe(false);
    expect(template.name).toBe('My Layout');
    expect(template.openTabs).toEqual(['base64']);
    expect(template.id).toBeTruthy();
  });
});

describe('migrateWorkspaceTemplateStore', () => {
  it('returns the empty store for null/non-object/mismatched-schema input', () => {
    expect(migrateWorkspaceTemplateStore(null)).toEqual(EMPTY_WORKSPACE_TEMPLATE_STORE);
    expect(migrateWorkspaceTemplateStore('garbage')).toEqual(EMPTY_WORKSPACE_TEMPLATE_STORE);
    expect(migrateWorkspaceTemplateStore({ schemaVersion: 2, userTemplates: [] })).toEqual(EMPTY_WORKSPACE_TEMPLATE_STORE);
  });

  it('returns the empty store when userTemplates is missing or malformed', () => {
    expect(migrateWorkspaceTemplateStore({ schemaVersion: 1 })).toEqual(EMPTY_WORKSPACE_TEMPLATE_STORE);
    expect(migrateWorkspaceTemplateStore({ schemaVersion: 1, userTemplates: 'nope' })).toEqual(EMPTY_WORKSPACE_TEMPLATE_STORE);
  });

  it('passes through a well-formed store unchanged', () => {
    const valid: WorkspaceTemplateStore = {
      schemaVersion: 1,
      userTemplates: [createWorkspaceTemplate('Custom', null, ['json'])],
      recentlyAppliedIds: [],
    };
    expect(migrateWorkspaceTemplateStore(valid)).toEqual(valid);
  });

  it('defaults recentlyAppliedIds to an empty array when missing from persisted data', () => {
    const result = migrateWorkspaceTemplateStore({ schemaVersion: 1, userTemplates: [] });
    expect(result.recentlyAppliedIds).toEqual([]);
  });
});
