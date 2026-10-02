import { applyJsonTreeEdit } from "./json-tree-edit.js";

describe('applyJsonTreeEdit', () => {
  it('sets a value at a nested path', () => {
    const result = applyJsonTreeEdit({ a: { b: 1 } }, ['a', 'b'], { kind: 'setValue', value: 42 });
    expect(result).toEqual({ ok: true, root: { a: { b: 42 } } });
  });

  it('sets a value at an array index', () => {
    const result = applyJsonTreeEdit({ items: [1, 2, 3] }, ['items', 1], { kind: 'setValue', value: 99 });
    expect(result).toEqual({ ok: true, root: { items: [1, 99, 3] } });
  });

  it('changes the type of a node to a default value', () => {
    const result = applyJsonTreeEdit({ a: 1 }, ['a'], { kind: 'setType', type: 'object' });
    expect(result).toEqual({ ok: true, root: { a: {} } });
  });

  it('renames an object key, preserving order', () => {
    const result = applyJsonTreeEdit({ a: 1, b: 2 }, ['a'], { kind: 'renameKey', newKey: 'z' });
    expect(result).toEqual({ ok: true, root: { z: 1, b: 2 } });
  });

  it('rejects renaming to a key that already exists', () => {
    const result = applyJsonTreeEdit({ a: 1, b: 2 }, ['a'], { kind: 'renameKey', newKey: 'b' });
    expect(result).toEqual({ ok: false, error: 'Key "b" already exists.' });
  });

  it('rejects renaming an array index', () => {
    const result = applyJsonTreeEdit({ items: [1, 2] }, ['items', 0], { kind: 'renameKey', newKey: 'x' });
    expect(result).toEqual({ ok: false, error: 'Array indices cannot be renamed.' });
  });

  it('deletes an object key', () => {
    const result = applyJsonTreeEdit({ a: 1, b: 2 }, ['a'], { kind: 'delete' });
    expect(result).toEqual({ ok: true, root: { b: 2 } });
  });

  it('deletes an array element, shifting later indices', () => {
    const result = applyJsonTreeEdit({ items: [1, 2, 3] }, ['items', 1], { kind: 'delete' });
    expect(result).toEqual({ ok: true, root: { items: [1, 3] } });
  });

  it('rejects deleting the root value', () => {
    const result = applyJsonTreeEdit({ a: 1 }, [], { kind: 'delete' });
    expect(result).toEqual({ ok: false, error: 'Cannot delete the root value.' });
  });

  it('adds a child to an object with an auto-generated key', () => {
    const result = applyJsonTreeEdit({ a: 1 }, [], { kind: 'addChild', value: 'x' });
    expect(result).toEqual({ ok: true, root: { a: 1, newKey1: 'x' } });
  });

  it('adds a child with an explicit key', () => {
    const result = applyJsonTreeEdit({}, [], { kind: 'addChild', key: 'foo', value: 'bar' });
    expect(result).toEqual({ ok: true, root: { foo: 'bar' } });
  });

  it('rejects adding a child with a key that already exists', () => {
    const result = applyJsonTreeEdit({ foo: 1 }, [], { kind: 'addChild', key: 'foo', value: 2 });
    expect(result).toEqual({ ok: false, error: 'Key "foo" already exists.' });
  });

  it('adds a child to an array by appending', () => {
    const result = applyJsonTreeEdit({ items: [1, 2] }, ['items'], { kind: 'addChild', value: 3 });
    expect(result).toEqual({ ok: true, root: { items: [1, 2, 3] } });
  });

  it('rejects adding a child to a primitive', () => {
    const result = applyJsonTreeEdit({ a: 1 }, ['a'], { kind: 'addChild', value: 2 });
    expect(result).toEqual({ ok: false, error: 'Can only add children to an object or array.' });
  });

  it('rejects an out-of-range array index', () => {
    const result = applyJsonTreeEdit({ items: [1, 2] }, ['items', 5], { kind: 'setValue', value: 0 });
    expect(result).toEqual({ ok: false, error: 'Array index out of range.' });
  });

  it('rejects a path that does not match the document structure', () => {
    const result = applyJsonTreeEdit({ a: 1 }, ['a', 'b'], { kind: 'setValue', value: 0 });
    expect(result).toEqual({ ok: false, error: 'Path does not match the document structure.' });
  });

  it('sets the root value directly when segments are empty', () => {
    const result = applyJsonTreeEdit({ a: 1 }, [], { kind: 'setValue', value: 'replaced' });
    expect(result).toEqual({ ok: true, root: 'replaced' });
  });
});
