import fc from 'fast-check';
import { describe, it } from 'vitest';
import { roundTrip } from "../../../../../../tests/property-harness";
import { parseGitUrl, type GitUrlProtocol } from "@dude/tool-engine/tools/git-url-parser/git-url-parser-logic";

const part = fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/);
const host = fc.tuple(part, part).map(([a, b]) => `${a}.${b}`);
const remote = fc.record({ protocol: fc.constantFrom('https' as const, 'http' as const, 'ssh' as const, 'git' as const), host, owner: part, repo: part, port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }) }).map(({ protocol, host: h, owner, repo, port }) => ({ protocol, user: protocol === 'ssh' ? 'git' : undefined, host: h, owner, repo, ...(port === undefined ? {} : { port }) }));

describe('parseGitUrl properties', () => {
  it('round-trips generated supported URL remotes', () => {
    roundTrip(
      (value) => `${value.protocol}://${value.protocol === 'ssh' ? `${value.user}@` : ''}${value.host}${value.port === undefined ? '' : `:${value.port}`}/${value.owner}/${value.repo}.git`,
      (encoded) => {
        const parsed = parseGitUrl(encoded as string);
        if (!parsed.ok) throw new Error(parsed.error);
        return {
          protocol: parsed.value.protocol as Exclude<GitUrlProtocol, 'scp'>,
          user: parsed.value.user,
          host: parsed.value.host,
          owner: parsed.value.owner,
          repo: parsed.value.repo,
          ...(parsed.value.port === undefined ? {} : { port: parsed.value.port }),
        };
      },
      remote,
    );
  });
});
