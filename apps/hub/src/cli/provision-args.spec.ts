import { describe, expect, it } from 'vitest';
import { HELP_TEXT, UsageError, parseArgs } from './args.js';

describe('dude-hub provision arguments', () => {
  it('runs by default and reports with "status"', () => {
    expect(parseArgs(['provision'])).toEqual({ command: 'provision', action: 'run' });
    expect(parseArgs(['provision', 'status'])).toEqual({ command: 'provision', action: 'status' });
  });

  it('takes --json, --data-dir and --install-dir in either form, before or after status', () => {
    expect(parseArgs(['provision', '--json', '--data-dir', 'D:\\hub', '--install-dir=C:\\Hub'])).toEqual({ command: 'provision', action: 'run', json: true, dataDir: 'D:\\hub', installDir: 'C:\\Hub' });
    expect(parseArgs(['provision', 'status', '--json'])).toEqual({ command: 'provision', action: 'status', json: true });
  });

  it('refuses anything that could carry a secret or is not a flag it knows', () => {
    for (const flags of [['--token', 'abc'], ['--secret=abc'], ['--tunnel-token', 'abc'], ['--passphrase', 'abc'], ['extra'], ['status', 'extra'], ['--json=true']]) {
      expect(() => parseArgs(['provision', ...flags]), flags.join(' ')).toThrow(UsageError);
    }
  });

  it('is documented in the help text with its exit codes', () => {
    expect(HELP_TEXT).toMatch(/dude-hub provision \[--json\]/);
    expect(HELP_TEXT).toMatch(/dude-hub provision status/);
    expect(HELP_TEXT).toMatch(/exit 0 = ready or degraded/);
  });
});
