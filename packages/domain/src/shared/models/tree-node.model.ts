/**
 * Generic node shape for `TreeView` — deliberately not JSON-specific so a
 * future tool (e.g. an XML structure view) can reuse this primitive. A
 * domain-specific tool is responsible for turning its own parsed data into
 * this shape (see `json-tree.ts`'s `toTreeNode`).
 */
export interface TreeNode {
    readonly label: string;
    readonly path: string;
    readonly valueLabel: string;
    readonly type: string;
    readonly children?: readonly TreeNode[];
}
