import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { buildGitCommand, GIT_SUBCOMMANDS } from './git-command-builder-logic';

describe('git-command-builder properties', () => {
  it('always emits a git command with a known subcommand', () => {
    invariant(
      ({ command, value }: { command: (typeof GIT_SUBCOMMANDS)[number]; value: string }) => buildGitCommand(command, { repository: value, message: value, name: value }),
      fc.record({ command: fc.constantFrom(...GIT_SUBCOMMANDS), value: fc.string() }),
      (result, input) => result.startsWith(`git ${input.command}`),
    );
  });
});
