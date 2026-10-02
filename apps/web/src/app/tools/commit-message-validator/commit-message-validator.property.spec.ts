import fc from 'fast-check';
import { neverThrows } from "../../../../../../tests/property-harness";
import { validateCommitMessage } from "@dude/tool-engine/tools/commit-message-validator/commit-message-validator-logic";

describe('validateCommitMessage properties', () => {
  it('never throws for arbitrary message text and returns only valid issue severities', () => {
    neverThrows(validateCommitMessage, fc.string({ maxLength: 500 }), {
      assertShape: (result) => expect((result as ReturnType<typeof validateCommitMessage>).every((issue) => issue.severity === 'error' || issue.severity === 'warning')).toBe(true),
    });
  });
});
