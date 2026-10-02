import { describe, expect, it } from 'vitest';
import { createProject } from "./project.model.js";

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

