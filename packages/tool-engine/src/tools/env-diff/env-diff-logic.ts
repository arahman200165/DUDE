/** Pure, framework-free `.env` diffing: parses two `.env` files to flat key-value objects and reuses Advanced Diff's `diffTrees()`. */
import { diffTrees, type TreeDiffResult } from "../advanced-diff/object-tree-diff.js";
import { envToObject } from "../env-editor/env-format.js";

export function diffEnvFiles(before: string, after: string): TreeDiffResult {
  return diffTrees(envToObject(before), envToObject(after), { ignoreCase: false });
}
