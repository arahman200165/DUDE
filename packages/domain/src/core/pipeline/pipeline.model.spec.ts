import { describe, expect, it } from 'vitest';
import { EMPTY_PIPELINE_STORE, EMPTY_USER_SCRIPT_STORE, migratePipelineStore, migrateUserScriptStore } from "./pipeline.model.js";

describe('migratePipelineStore', () => {
  it('passes through a well-formed store', () => {
    const store = { schemaVersion: 1 as const, pipelines: [] };
    expect(migratePipelineStore(store)).toEqual(store);
  });

  it('falls back to empty on corrupt/unrecognized shape', () => {
    expect(migratePipelineStore(null)).toEqual(EMPTY_PIPELINE_STORE);
    expect(migratePipelineStore('garbage')).toEqual(EMPTY_PIPELINE_STORE);
    expect(migratePipelineStore({ schemaVersion: 99, pipelines: [] })).toEqual(EMPTY_PIPELINE_STORE);
    expect(migratePipelineStore({ schemaVersion: 1 })).toEqual(EMPTY_PIPELINE_STORE);
  });
});

describe('migrateUserScriptStore', () => {
  it('passes through a well-formed store', () => {
    const store = { schemaVersion: 1 as const, scripts: [] };
    expect(migrateUserScriptStore(store)).toEqual(store);
  });

  it('falls back to empty on corrupt/unrecognized shape', () => {
    expect(migrateUserScriptStore(undefined)).toEqual(EMPTY_USER_SCRIPT_STORE);
    expect(migrateUserScriptStore({ scripts: [] })).toEqual(EMPTY_USER_SCRIPT_STORE);
  });
});
