import type { Project } from '@dude/domain/core/project/project.model';
import type { WorkspaceTemplate } from '@dude/domain/core/workspace/workspace-template.model';
import { sanitizePreferenceOverrides, withPreferenceOverrides } from '@dude/domain/core/workspace/workspace.model';
import type { EntityCodec } from './entity-codec.js';
import { isNonEmptyString, isRecord, optionalString, sanitizePanelTree, stringArray } from './codec-helpers.js';

export const projectCodec: EntityCodec<Project> = {
  entityType: 'project',
  schemaVersion: 1,
  scope: 'workspace',
  sensitivity: 'sensitive',
  journaled: true,
  idOf: (project) => project.id,
  decode(raw) {
    if (!isRecord(raw)) return null;
    const { id, name, createdAt } = raw;
    if (!isNonEmptyString(id) || typeof name !== 'string' || typeof createdAt !== 'string') return null;
    return {
      id,
      name,
      ...optionalString('description', raw['description']),
      createdAt,
      ...optionalString('lastActivatedAt', raw['lastActivatedAt']),
      panelTree: sanitizePanelTree(raw['panelTree']),
      openTabs: stringArray(raw['openTabs']),
      pinnedPipelineIds: stringArray(raw['pinnedPipelineIds']),
      ...withPreferenceOverrides(sanitizePreferenceOverrides(raw['preferenceOverrides'])),
    };
  },
  encode: (project) => ({ ...project }),
};

/** One user template per record. `recentlyAppliedIds` is not part of an entity (it stays a plain setting). */
export const workspaceTemplateCodec: EntityCodec<WorkspaceTemplate> = {
  entityType: 'workspace-template',
  schemaVersion: 1,
  scope: 'workspace',
  sensitivity: 'non-sensitive',
  journaled: true,
  idOf: (template) => template.id,
  decode(raw) {
    if (!isRecord(raw)) return null;
    const { id, name } = raw;
    if (!isNonEmptyString(id) || typeof name !== 'string') return null;
    return {
      id,
      name,
      ...optionalString('description', raw['description']),
      builtIn: raw['builtIn'] === true,
      panelTree: sanitizePanelTree(raw['panelTree']),
      openTabs: stringArray(raw['openTabs']),
      ...withPreferenceOverrides(sanitizePreferenceOverrides(raw['preferenceOverrides'])),
    };
  },
  encode: (template) => ({ ...template }),
};
