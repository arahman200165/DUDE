import { PipelineStep, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateSshKeyPair } from "./ssh-key-logic.js";

/**
 * Pipeline-step adapter for the SSH Key Generator & Inspector — only the
 * generation half (DUDE_PRD.md §21 Item 2's pipeline batch migration
 * guidance explicitly calls this out as a generator-style step; the inspect
 * half takes an existing SSH public key line, a separate, non-generator
 * capability not wired up here). The piped value is ignored and a fresh
 * Ed25519 key pair is generated (matching the tool's own default family),
 * producing its public key line — typically used to seed a chain into
 * another SSH-aware step.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(): Promise<PipelineStepResult> {
    try {
      const pair = await generateSshKeyPair({ family: 'ed25519' });
      return { ok: true, output: { type: 'text', value: pair.publicKeyLine } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'SSH key generation failed.', kind: 'execution-error' } };
    }
  },
};
