import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { validateCommitMessage } from "./commit-message-validator-logic.js";

/**
 * Pipeline-step adapter for the Commit Message Validator tool. Formats the
 * tool's issue list as readable text lines (`[severity] message`); the step
 * itself never fails — an invalid commit message is a reported finding, not a
 * broken pipeline step, matching the tool's own "flag issues, don't throw" posture.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Commit Message Validator expects text input.', kind: 'invalid-input' } };
    }

    try {
      const issues = validateCommitMessage(input.value);
      const value = issues.length === 0 ? 'No issues found.' : issues.map((issue) => `[${issue.severity}] ${issue.message}`).join('\n');
      return { ok: true, output: { type: 'text', value } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to validate commit message.', kind: 'execution-error' } };
    }
  },
};
