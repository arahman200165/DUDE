import { describe, expect, it } from 'vitest';
import {
  EMPTY_FAVORITES_STORE,
  FavoritesStore,
  togglePipelineId,
  toggleToolId,
} from "./favorites.model.js";

describe('toggleToolId', () => {
  it('adds a tool id not already pinned', () => {
    const store = toggleToolId(EMPTY_FAVORITES_STORE, 'base64');
    expect(store.toolIds).toEqual(['base64']);
  });

  it('removes a tool id already pinned', () => {
    const pinned = toggleToolId(EMPTY_FAVORITES_STORE, 'base64');
    const unpinned = toggleToolId(pinned, 'base64');
    expect(unpinned.toolIds).toEqual([]);
  });

  it('does not affect pipelineIds', () => {
    const store = togglePipelineId(EMPTY_FAVORITES_STORE, 'p1');
    const updated = toggleToolId(store, 'base64');
    expect(updated.pipelineIds).toEqual(['p1']);
  });
});

describe('togglePipelineId', () => {
  it('adds and removes a pipeline id', () => {
    const pinned = togglePipelineId(EMPTY_FAVORITES_STORE, 'p1');
    expect(pinned.pipelineIds).toEqual(['p1']);
    const unpinned = togglePipelineId(pinned, 'p1');
    expect(unpinned.pipelineIds).toEqual([]);
  });
});

