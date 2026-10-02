import { BUILT_IN_PLUGINS, TABLE_FORMATTER_PLUGIN } from "./builtin-plugins.js";

/** Extracts the plugin's `run` function from its raw source the same way the sandboxed iframe would define it, without needing a real iframe. */
function extractRun(source: string): (input: string) => string {
  return new Function(`${source}\nreturn run;`)() as (input: string) => string;
}

describe('TABLE_FORMATTER_PLUGIN', () => {
  const run = extractRun(TABLE_FORMATTER_PLUGIN.source);

  it('realigns a raggedly-spaced pipe table to consistent column widths (3-char minimum)', () => {
    const input = '| a | bb |\n|---|---|\n| 1 | 22 |\n| 333 | 4 |';
    const output = run(input);
    expect(output).toBe('| a   | bb  |\n| --- | --- |\n| 1   | 22  |\n| 333 | 4   |');
  });

  it('preserves left/center/right alignment markers', () => {
    const input = '|left|center|right|\n|:--|:--:|--:|\n|a|b|c|';
    const output = run(input);
    const lines = output.split('\n');
    expect(lines[1]).toContain(':--');
    expect(lines[1]).toContain('--:');
  });

  it('leaves non-table lines untouched', () => {
    const input = '# Heading\n\nSome paragraph text.\n\n| a | b |\n|---|---|\n| 1 | 2 |';
    const output = run(input);
    expect(output).toContain('# Heading');
    expect(output).toContain('Some paragraph text.');
  });

  it('handles multiple tables in one document', () => {
    const input = '| a |\n|---|\n| 1 |\n\ntext\n\n| bb |\n|----|\n| 22 |';
    const output = run(input);
    expect(output.split('\n\n')).toHaveLength(3);
  });

  it('preserves an escaped pipe inside a cell', () => {
    const input = '| a | b |\n|---|---|\n| x\\|y | z |';
    const output = run(input);
    expect(output).toContain('x|y');
  });
});

describe('BUILT_IN_PLUGINS', () => {
  it('includes the Table Formatter as a toolbar-action plugin', () => {
    expect(BUILT_IN_PLUGINS).toContainEqual(TABLE_FORMATTER_PLUGIN);
    expect(TABLE_FORMATTER_PLUGIN.kind).toBe('toolbar-action');
  });
});
