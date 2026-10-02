import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'sid-account-resolver',
    title: 'SID & Account Resolver',
    description: 'Decode Windows SIDs, resolve account names, and inspect the current token, local accounts, groups and profile list.',
    category: 'security',
    keywords: ['well-known SID', 'integrity level', 'privileges', 'SID', 'security identifier', 'account', 'user', 'group', 'token', 'privilege', 'profile', 'whoami'],
    route: '/tools/sid-account-resolver',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    capabilities: [
        { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'resolves Windows SIDs and reads the current token, local accounts, groups and user profiles on Desktop DUDE' },
    ],
    network: { required: false, detail: 'looking up a domain account name or SID can contact a domain controller (LookupAccountName/LookupAccountSid); nothing is sent until you press a Resolve button, and decoding is fully local' },
    verification: {
        crossChecked: ['whoami /all (token groups, SIDs, attributes, privileges, integrity level)', 'Get-LocalUser / Get-LocalGroup', 'HKLM ProfileList registry key'],
        propertyTested: true,
        summary: 'SID string/binary/base64 codec round-trip tested; token, local accounts, groups and profiles compared against whoami /all, Get-LocalUser, Get-LocalGroup and the ProfileList registry key.',
    },
    io: { accepts: ['text'], produces: ['json', 'file'] }
};
