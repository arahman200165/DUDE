import { binaryValueToTree } from "./binary-value-tree.js";

describe('binaryValueToTree', () => {
  it('builds a single root node for a scalar value', () => {
    expect(binaryValueToTree(42, 'root')).toEqual([{ label: 'root', path: '$', valueLabel: '42', type: 'number' }]);
  });

  it('builds children for a plain object, keyed by property name', () => {
    const tree = binaryValueToTree({ a: 1, b: 'x' }, 'root');

    expect(tree).toEqual([
      {
        label: 'root',
        path: '$',
        valueLabel: '{ 2 }',
        type: 'object',
        children: [
          { label: 'a', path: '$.a', valueLabel: '1', type: 'number' },
          { label: 'b', path: '$.b', valueLabel: '"x"', type: 'string' },
        ],
      },
    ]);
  });

  it('builds indexed children for an array', () => {
    const tree = binaryValueToTree([10, 20], 'root');

    expect(tree).toEqual([
      {
        label: 'root',
        path: '$',
        valueLabel: '[ 2 ]',
        type: 'array',
        children: [
          { label: '0', path: '$[0]', valueLabel: '10', type: 'number' },
          { label: '1', path: '$[1]', valueLabel: '20', type: 'number' },
        ],
      },
    ]);
  });

  it('builds children for a Map, keyed by stringified key', () => {
    const tree = binaryValueToTree(new Map([['a', 1]]), 'root');

    expect(tree).toEqual([
      {
        label: 'root',
        path: '$',
        valueLabel: 'Map( 1 )',
        type: 'map',
        children: [{ label: 'a', path: '$[0]', valueLabel: '1', type: 'number' }],
      },
    ]);
  });

  it('renders a Uint8Array as a byte-count leaf, not an array of numbers', () => {
    const tree = binaryValueToTree(new Uint8Array([1, 2, 3]), 'root');

    expect(tree).toEqual([{ label: 'root', path: '$', valueLabel: '<3 bytes>', type: 'bytes' }]);
  });

  it('renders a Date as an ISO string leaf', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const tree = binaryValueToTree(date, 'root');

    expect(tree).toEqual([{ label: 'root', path: '$', valueLabel: '2024-01-01T00:00:00.000Z', type: 'date' }]);
  });

  it('renders null and undefined as leaves', () => {
    expect(binaryValueToTree(null, 'root')).toEqual([{ label: 'root', path: '$', valueLabel: 'null', type: 'null' }]);
    expect(binaryValueToTree(undefined, 'root')).toEqual([{ label: 'root', path: '$', valueLabel: 'undefined', type: 'undefined' }]);
  });

  it('renders a bigint with a trailing "n"', () => {
    const tree = binaryValueToTree(9007199254740993n, 'root');

    expect(tree).toEqual([{ label: 'root', path: '$', valueLabel: '9007199254740993n', type: 'bigint' }]);
  });

  it('nests objects inside arrays and vice versa', () => {
    const tree = binaryValueToTree([{ a: 1 }], 'root');

    expect(tree).toEqual([
      {
        label: 'root',
        path: '$',
        valueLabel: '[ 1 ]',
        type: 'array',
        children: [
          {
            label: '0',
            path: '$[0]',
            valueLabel: '{ 1 }',
            type: 'object',
            children: [{ label: 'a', path: '$[0].a', valueLabel: '1', type: 'number' }],
          },
        ],
      },
    ]);
  });
});
