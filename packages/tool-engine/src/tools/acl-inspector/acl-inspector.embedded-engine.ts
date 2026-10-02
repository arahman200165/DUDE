
export interface AceRow {
    readonly key: number;
    readonly type: string;
    readonly category: 'allow' | 'deny' | 'audit' | 'other';
    readonly principal: string;
    readonly sid: string;
    readonly named: boolean;
    readonly summary: string;
    readonly short: string;
    readonly details: readonly string[];
    readonly hex: string;
    readonly icacls: string;
    readonly scope: string;
    readonly inherited: boolean;
    readonly inheritedFrom: string | null;
    readonly auditFlags: string;
}
export function AclInspectorTool_categoryClass(category: AceRow['category']): string {
    return category === 'allow' ? 'text-success' : category === 'deny' ? 'text-error' : category === 'audit' ? 'text-warning' : 'text-text-muted';
}
