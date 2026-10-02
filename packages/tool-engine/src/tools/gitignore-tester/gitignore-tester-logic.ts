/**
 * The `.gitignore` semantics moved to `packages/tool-engine/src/shared/fs/gitignore.ts` in Phase 29 (Milestone 523)
 * once the native tree walker (`apps/desktop/fs-walk.ts`) became a second consumer.
 */
export { parseGitignoreRules, testGitignorePaths, type GitignoreRule, type GitignoreTestResult } from "../../shared/fs/gitignore.js";
