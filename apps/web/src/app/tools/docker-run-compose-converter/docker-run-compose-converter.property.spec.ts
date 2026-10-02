import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { composeToDockerRun, dockerRunToCompose, parseDockerRun } from "@dude/tool-engine/tools/docker-run-compose-converter/docker-run-compose-converter-logic";

describe('docker-run-compose-converter properties', () => {
  it('round-trips simple docker run image and port arguments', () => {
    const safe = fc.stringMatching(/^[a-z0-9][a-z0-9./:-]{0,20}$/);
    invariant(
      (input: { image: string; port: string }) => {
        const yaml = dockerRunToCompose(`docker run -p ${input.port} ${input.image}`, 'app');
        return yaml.ok ? composeToDockerRun(yaml.output, 'app') : yaml;
      },
      fc.record({ image: safe, port: fc.integer({ min: 1, max: 65535 }).map(String) }),
      (result, input) => result.ok && result.output === `docker run -p ${input.port} ${input.image}`,
    );
  });
  it('never throws while parsing arbitrary commands', () => {
    neverThrows(parseDockerRun, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});
