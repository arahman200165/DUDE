/**
 * The `.gitignore` semantics moved to `src/shared-logic/fs/gitignore.ts` in Phase 29 (Milestone 523)
 * once the native tree walker (`electron/fs-walk.ts`) became a second consumer.
 */
export { parseGitignoreRules, testGitignorePaths, type GitignoreRule, type GitignoreTestResult } from '../../../shared-logic/fs/gitignore';
