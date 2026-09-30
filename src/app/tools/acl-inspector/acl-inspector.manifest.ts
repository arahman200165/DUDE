import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'acl-inspector',
  title: 'ACL Inspector',
  description: 'Inspect Windows file, folder and registry security descriptors: owner, DACL and SACL entries, decoded rights, inheritance and SDDL; add or remove a permission entry or change inheritance through a reviewed, undoable system plan.',
  category: 'security',
  keywords: ['acl', 'icacls', 'get-acl', 'permissions', 'sddl', 'dacl', 'sacl', 'ace', 'owner', 'effective access', 'security descriptor', 'access control', 'inheritance', 'Windows'],
  route: '/tools/acl-inspector',
  load: () => import('./acl-inspector').then((module) => module.AclInspectorTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads security descriptors for native file, folder and registry targets' },
    { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'uses a native picker to grant a file or folder for ACL inspection and editing' },
    { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'edits the DACL of one file, folder or registry key through the desktop system mutation engine (never the owner or audit rules)' },
  ],
  consequenceClass: ['system-config'],
  network: { required: false, detail: 'resolving account names and computing effective access can contact a domain controller (LookupAccountSid, GetEffectiveRightsFromAcl); nothing else leaves the machine' },
  verification: {
    crossChecked: ['(Get-Acl <path>).Sddl for C:\\Windows, the user profile, a temp file, HKCU\\Software and HKLM\\SOFTWARE\\Microsoft (same ACEs; Get-Acl re-sorts them, ours is stored order)', 'icacls <path> (principals, rights such as F/M/RX/GR,GE, (I)(OI)(CI)(IO) notation and inheritance order match line by line)'],
    propertyTested: false,
    vectors: ['real Get-Acl SDDL from C:\\Windows, a user profile, HKCU\\Software, HKLM\\SOFTWARE\\Microsoft, WindowsApps (conditional ACE) and System Volume Information round-trip byte for byte'],
    summary: 'SDDL parse/format round-trips real Windows descriptors; the helper output was compared with Get-Acl and icacls on files, folders and registry keys. DACL edits were applied and undone through the helper on a temp folder (add an explicit (OI)(CI) entry, disable inheritance with convert, restore) and on HKCU\\Software\\DUDE-Test, checked with icacls and Get-Acl, and the folder SDDL came back byte-identical after undo; the registry key differs only by the auto-inherit AI flag Windows sets on any DACL write.',
  },
  io: { accepts: ['file', 'text'], produces: ['json', 'file'] },
};
