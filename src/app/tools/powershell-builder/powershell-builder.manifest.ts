import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'powershell-builder',
  title: 'PowerShell Builder',
  description: 'Build PowerShell 7 commands from the real cmdlet catalog (parameter sets, types, ValidateSet), or write a script by hand, review the exact text with its SHA-256, and run it only after an explicit confirmation.',
  category: 'developer',
  keywords: ['powershell', 'pwsh', 'cmdlet', 'script', 'command builder', 'run script', 'get-command', 'pipeline', 'windows', 'format-table', 'convertto-json'],
  route: '/tools/powershell-builder',
  load: () => import('./powershell-builder').then((m) => m.PowerShellBuilderTool),
  status: 'experimental',
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads the PowerShell 7 cmdlet catalog (Get-Command metadata) in Desktop DUDE' },
    { kind: 'platform', id: 'native-system-write', web: 'unavailable', note: 'runs a reviewed PowerShell script (which may change anything the account can) after a previewed, single-use confirmation in Desktop DUDE' },
  ],
  consequenceClass: ['code-execution'],
  io: { accepts: ['text'], produces: ['text'] },
  verification: {
    crossChecked: ['generated commands round-trip through pwsh [System.Management.Automation.Language.Parser]::ParseInput: AST parameter values equal the inputs'],
    propertyTested: true,
    summary: 'Literal quoting is property-tested with fast-check and cross-checked against the PowerShell 7 parser (Parser::ParseInput) over thousands of generated commands.',
  },
};
