import { describe, expect, it } from 'vitest';
import { EMPTY_PROJECT_STORE, ProjectStore, createProject, migrateProjectStore } from './project.model';

describe('createProject', () => {
  it('creates a project with a fresh id, timestamp, and empty pinned pipelines', () => {
    const project = createProject('My Project', null, ['base64']);
    expect(project.name).toBe('My Project');
    expect(project.openTabs).toEqual(['base64']);
    expect(project.pinnedPipelineIds).toEqual([]);
    expect(project.id).toBeTruthy();
    expect(project.createdAt).toBeTruthy();
    expect(project.lastActivatedAt).toBeUndefined();
  });
});

describe('migrateProjectStore', () => {
  it('returns the empty store for null/non-object/mismatched-schema input', () => {
    expect(migrateProjectStore(null)).toEqual(EMPTY_PROJECT_STORE);
    expect(migrateProjectStore('garbage')).toEqual(EMPTY_PROJECT_STORE);
    expect(migrateProjectStore({ schemaVersion: 2, projects: [] })).toEqual(EMPTY_PROJECT_STORE);
  });

  it('returns the empty store when projects is missing or malformed', () => {
    expect(migrateProjectStore({ schemaVersion: 1 })).toEqual(EMPTY_PROJECT_STORE);
    expect(migrateProjectStore({ schemaVersion: 1, projects: 'nope' })).toEqual(EMPTY_PROJECT_STORE);
  });

  it('passes through a well-formed store unchanged', () => {
    const valid: ProjectStore = {
      schemaVersion: 1,
      projects: [createProject('Custom', null, ['json'])],
    };
    expect(migrateProjectStore(valid)).toEqual(valid);
  });
});
