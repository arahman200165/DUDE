import { describe, expect, it, vi } from 'vitest';
import { ToolInputStore } from './tool-input-store';

describe('ToolInputStore', () => {
  it('returns a stable empty input and merges partial updates per tool', () => {
    const store = new ToolInputStore();
    expect(store.get('base64')).toBe(store.get('json'));
    store.set('base64', { text: 'a' });
    store.set('base64', { mode: 'decode' });
    store.set('json', { text: 'b' });
    expect(store.get('base64')).toEqual({ text: 'a', mode: 'decode' });
    expect(store.get('json')).toEqual({ text: 'b' });
  });
  it('keeps the snapshot reference stable between changes and frozen', () => {
    const store = new ToolInputStore();
    store.set('a', { x: 1 });
    expect(store.get('a')).toBe(store.get('a'));
    expect(Object.isFrozen(store.get('a'))).toBe(true);
  });
  it('prefill replaces rather than merges, and clear/clearAll notify only on change', () => {
    const store = new ToolInputStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set('a', { old: 1 });
    store.prefill('a', { shared: 'text' });
    expect(store.get('a')).toEqual({ shared: 'text' });
    store.clear('missing');
    expect(listener).toHaveBeenCalledTimes(2);
    store.clear('a');
    expect(store.get('a')).toEqual({});
    store.set('a', { v: 1 });
    store.set('b', { v: 2 });
    store.clearAll();
    expect(store.get('a')).toEqual({});
    expect(store.get('b')).toEqual({});
    const calls = listener.mock.calls.length;
    store.clearAll();
    expect(listener).toHaveBeenCalledTimes(calls);
    off();
    store.set('a', { v: 3 });
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
