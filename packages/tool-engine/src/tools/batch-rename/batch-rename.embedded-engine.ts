import { computeRenames, DEFAULT_RENAME, type RenameOptions, type RenameProposal } from "../../shared/fs/rename-pattern.js";
export function BatchRenameTool_statusClass(status: RenameProposal['status']): string {
    return status === 'rename' ? 'text-accent' : status === 'unchanged' ? 'text-text-muted' : 'text-error';
}
export function BatchRenameTool_trackProposal(_index: number, proposal: RenameProposal): string { return proposal.path; }
