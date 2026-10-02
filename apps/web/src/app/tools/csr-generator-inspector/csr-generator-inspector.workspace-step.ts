import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'csr-generator-inspector';

interface SubjectValues {
  readonly CN: string;
  readonly O: string;
  readonly OU: string;
  readonly L: string;
  readonly ST: string;
  readonly C: string;
  readonly E: string;
}

/**
 * `historyEligible` deliberately omitted: this tool also handles a signing private key
 * (`privateKeyPem`, a bare in-memory signal, correctly never touched here) — only the
 * non-secret certificate-subject fields are mirrored for tab continuity.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const subjectValues = readStorageValue<SubjectValues>(TOOL_ID, 'subjectValues', 'session');
    if (!subjectValues || !Object.values(subjectValues).some((v) => v)) return undefined;

    const mode = readStorageValue<'generate' | 'inspect'>(TOOL_ID, 'mode', 'local') ?? 'generate';
    const preview = subjectValues.CN || Object.values(subjectValues).find((v) => v) || '';
    return { state: { mode, subjectValues }, summary: `CSR subject: "${preview}"` };
  },

  restore(state): void {
    if (state['mode'] === 'generate' || state['mode'] === 'inspect') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (state['subjectValues'] && typeof state['subjectValues'] === 'object') {
      writeStorageValue(TOOL_ID, 'subjectValues', 'session', state['subjectValues']);
    }
  },
};
