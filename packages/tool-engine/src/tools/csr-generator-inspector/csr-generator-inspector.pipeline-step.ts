import { PipelineStep, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { generateAsymmetricKeyPair } from "../asymmetric-key-generator/asymmetric-keygen-logic.js";
import { CsrSubjectField, generateCsr } from "./csr-logic.js";

const DEFAULT_SUBJECT: readonly CsrSubjectField[] = [{ shortName: 'CN', value: 'example.com' }];

/**
 * Pipeline-step adapter for the CSR Generator & Inspector — only the
 * generation half (DUDE_PRD.md §21 Item 2's pipeline batch migration
 * guidance explicitly calls this out as a generator-style step; the inspect
 * half takes an existing CSR PEM, which is a separate, non-generator
 * capability not wired up here). Real CSR generation needs both subject
 * fields and a signing private key, neither of which a pipeline step has a
 * param for yet (v1.1) — so this adapter ignores the piped value entirely,
 * generates a fresh RSA-2048 key pair via the Asymmetric Key Generator's own
 * logic, and signs a CSR for a fixed placeholder subject ("CN=example.com").
 * This is a fully real, self-contained CSR (not faked), just not
 * user-configurable yet.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(): Promise<PipelineStepResult> {
    try {
      const keyPair = await generateAsymmetricKeyPair({ family: 'rsa', modulusLength: 2048 });
      const result = generateCsr(DEFAULT_SUBJECT, keyPair.privateKeyPem);
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'execution-error' } };
      }
      return { ok: true, output: { type: 'text', value: result.csrPem } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'CSR generation failed.', kind: 'execution-error' } };
    }
  },
};
