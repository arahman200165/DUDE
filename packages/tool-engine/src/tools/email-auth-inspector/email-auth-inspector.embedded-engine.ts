import type { EmailAuthView } from "@dude/contracts/core/platform/network-live-types";
export function EmailAuthInspectorTool_view(result: unknown): EmailAuthView { return result as EmailAuthView; }
export function EmailAuthInspectorTool_tagEntries(tags: Readonly<Record<string, string>>): readonly [
    string,
    string
][] { return Object.entries(tags); }
export function EmailAuthInspectorTool_qualifierClass(qualifier?: string): string {
    return qualifier === '-' ? 'text-error' : qualifier === '~' ? 'text-warning' : qualifier === '?' ? 'text-text-muted' : 'text-success';
}
