import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';
import {
  BUILT_IN_TEMPLATES,
  EMPTY_WORKSPACE_TEMPLATE_STORE,
  WorkspaceTemplateStore,
  createWorkspaceTemplate,
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

