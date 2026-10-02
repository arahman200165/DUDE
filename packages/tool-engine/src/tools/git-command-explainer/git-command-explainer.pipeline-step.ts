import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { explainGitCommand } from "./git-command-explainer-logic.js";

/**
 * Pipeline-step adapter for the Git Command Explainer tool. Formats the tool's
 * per-token explanation list as readable text lines (`token (kind): description`)
 * rather than passing through the richer object array — the contract's `text`
 * output matches the tool's declared capability more honestly than `json` would
 * for a tool whose whole point is a human-readable explanation.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Git Command Explainer expects text input.', kind: 'invalid-input' } };
    }

    try {
      const tokens = explainGitCommand(input.value);
      if (tokens.length === 0) {
        return { ok: false, error: { message: 'Enter a git command.', kind: 'invalid-input' } };
      }

      const output = tokens.map((token) => `${token.text} (${token.kind}): ${token.description}`).join('\n');
      return { ok: true, output: { type: 'text', value: output } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to explain command.', kind: 'execution-error' } };
    }
  },
};
