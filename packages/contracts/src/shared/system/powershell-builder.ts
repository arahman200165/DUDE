/** Pure PowerShell pipeline renderer for M612. It creates source text only; it never runs it. */

export type PowerShellParameterType = 'string' | 'boolean' | 'switch' | 'number' | 'string[]' | 'number[]' | 'hashtable' | 'unknown';

export interface PowerShellParameterDefinition {
  readonly name: string;
  readonly type: PowerShellParameterType;
  readonly mandatory?: boolean;
  readonly validateSet?: readonly string[];
}

export interface PowerShellCmdletDefinition {
  readonly name: string;
  readonly parameterSets: readonly {
    readonly name: string;
    readonly parameters: readonly PowerShellParameterDefinition[];
  }[];
}

export type PowerShellHashtable = Readonly<Record<string, string | number | boolean>>;
export type PowerShellParameterValue = string | boolean | number | readonly string[] | readonly number[] | PowerShellHashtable;

export interface PowerShellPipelineStage {
  readonly cmdlet: string;
  readonly parameters: Readonly<Record<string, PowerShellParameterValue>>;
}

export type PowerShellOutputFormat =
  | { readonly kind: 'none' }
  | { readonly kind: 'table' | 'list' | 'select'; readonly properties?: readonly string[] }
  | { readonly kind: 'json'; readonly depth?: number }
  | { readonly kind: 'csv'; readonly delimiter?: string };

export interface PowerShellBuilderResult {
  readonly script: string;
  /** UTF-8 bytes of the exact script shown to the user, suitable for caller-side SHA-256. */
  readonly utf8: Uint8Array;
  readonly warnings: readonly PowerShellBuilderWarning[];
}

export interface PowerShellBuilderWarning {
  readonly code: 'destructive-verb' | 'code-eval' | 'elevation' | 'registry-write';
  readonly cmdlet: string;
  readonly message: string;
}

export class PowerShellBuilderError extends Error {
  override readonly name = 'PowerShellBuilderError';
}

/**
 * PowerShell single-quoted string literal. The tokenizer treats U+2018/U+2019/U+201A/U+201B like an ASCII
 * apostrophe, so each of them is doubled too; nothing else is special inside single quotes.
 */
export function quotePowerShellString(value: string): string {
  return `'${value.replace(/['\u2018\u2019\u201A\u201B]/g, (quote) => quote + quote)}'`;
}

function isPlainRecord(value: unknown): value is PowerShellHashtable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderScalar(value: unknown): string {
  if (typeof value === 'string') return quotePowerShellString(value);
  if (typeof value === 'boolean') return value ? '$true' : '$false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new PowerShellBuilderError('Unsupported parameter value.');
}

function renderHashtable(value: unknown): string {
  if (!isPlainRecord(value)) throw new PowerShellBuilderError('Expected a hashtable parameter value.');
  const entries = Object.entries(value).map(([key, entry]) => `${quotePowerShellString(key)} = ${renderScalar(entry)}`);
  return entries.length === 0 ? '@{}' : `@{ ${entries.join('; ')} }`;
}

function renderValue(value: PowerShellParameterValue, type: PowerShellParameterType): string {
  if (type === 'string') {
    if (typeof value !== 'string') throw new PowerShellBuilderError('Expected a string parameter value.');
    return quotePowerShellString(value);
  }
  if (type === 'boolean') {
    if (typeof value !== 'boolean') throw new PowerShellBuilderError('Expected a boolean parameter value.');
    return value ? '$true' : '$false';
  }
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new PowerShellBuilderError('Expected a finite numeric parameter value.');
    // In argument mode a leading minus or an exponent makes PowerShell read a bareword string; parentheses force a number.
    const text = String(value);
    return value < 0 || /e/i.test(text) ? `(${text})` : text;
  }
  if (type === 'string[]') {
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) throw new PowerShellBuilderError('Expected a string array parameter value.');
    return `@(${value.map(quotePowerShellString).join(', ')})`;
  }
  if (type === 'hashtable') return renderHashtable(value);
  if (type === 'switch') {
    if (typeof value !== 'boolean') throw new PowerShellBuilderError('Expected a boolean switch value.');
    return value ? '$true' : '$false';
  }
  if (type === 'number[]') {
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) throw new PowerShellBuilderError('Expected a numeric array parameter value.');
    return `@(${value.map(String).join(', ')})`;
  }
  return renderScalar(value);
}

function renderStage(stage: PowerShellPipelineStage, catalog: ReadonlyMap<string, PowerShellCmdletDefinition>): string {
  const cmdlet = catalog.get(stage.cmdlet.toLowerCase());
  if (!cmdlet) throw new PowerShellBuilderError(`Cmdlet is not in the selected catalog: ${stage.cmdlet}.`);
  const setCandidates = cmdlet.parameterSets.filter((set) => Object.keys(stage.parameters).every((name) => set.parameters.some((parameter) => parameter.name.toLowerCase() === name.toLowerCase())));
  if (setCandidates.length === 0) throw new PowerShellBuilderError(`No parameter set for ${stage.cmdlet} accepts the selected parameters.`);
  const viable = setCandidates.filter((set) => set.parameters.filter((parameter) => parameter.mandatory).every((parameter) => Object.keys(stage.parameters).some((name) => name.toLowerCase() === parameter.name.toLowerCase())));
  if (viable.length === 0) throw new PowerShellBuilderError(`A mandatory parameter is missing for ${stage.cmdlet}.`);
  const chosenSet = viable[0];

  const args = Object.entries(stage.parameters).map(([name, value]) => {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new PowerShellBuilderError(`Invalid parameter name: ${name}.`);
    const definition = chosenSet.parameters.find((parameter) => parameter.name.toLowerCase() === name.toLowerCase());
    if (!definition) throw new PowerShellBuilderError(`Unknown parameter -${name} for ${stage.cmdlet}.`);
    if (definition.validateSet && definition.validateSet.length > 0 && (typeof value !== 'string' || !definition.validateSet.includes(value))) {
      throw new PowerShellBuilderError(`Value for -${name} is not in its allowed set.`);
    }
    const rendered = renderValue(value, definition.type);
    // Bool arguments use explicit colon syntax so false is passed as false, not treated as a switch.
    return definition.type === 'boolean' || definition.type === 'switch' ? `-${definition.name}:${rendered}` : `-${definition.name} ${rendered}`;
  });
  return [cmdlet.name, ...args].join(' ');
}

function renderFormat(format: PowerShellOutputFormat): string | undefined {
  switch (format.kind) {
    case 'none': return undefined;
    case 'table':
    case 'list':
    case 'select': {
      const command = format.kind === 'table' ? 'Format-Table' : format.kind === 'list' ? 'Format-List' : 'Select-Object';
      return format.properties?.length ? `${command} -Property @(${format.properties.map(quotePowerShellString).join(', ')})` : command;
    }
    case 'json': {
      const depth = format.depth ?? 2;
      if (!Number.isInteger(depth) || depth < 1 || depth > 100) throw new PowerShellBuilderError('JSON depth must be an integer from 1 to 100.');
      return `ConvertTo-Json -Depth ${depth}`;
    }
    case 'csv': {
      const delimiter = format.delimiter ?? ',';
      if ([...delimiter].length !== 1 || /[\r\n\0]/.test(delimiter)) throw new PowerShellBuilderError('CSV delimiter must be one non-control character.');
      return `ConvertTo-Csv -NoTypeInformation -Delimiter ${quotePowerShellString(delimiter)}`;
    }
  }
}

const DESTRUCTIVE_VERBS = new Set(['add', 'clear', 'close', 'disable', 'dismount', 'down', 'erase', 'exit', 'format', 'install', 'lock', 'move', 'new', 'open', 'optimize', 'pop', 'push', 'remove', 'rename', 'reset', 'resize', 'restart', 'restore', 'save', 'set', 'start', 'stop', 'submit', 'suspend', 'uninstall', 'unlock', 'unpublish', 'update', 'write']);

function verbWarning(cmdlet: string): PowerShellBuilderWarning {
  return { code: 'destructive-verb', cmdlet, message: `${cmdlet} uses a verb commonly associated with changes; review its effects before running the script.` };
}

function destructiveWarnings(stages: readonly PowerShellPipelineStage[]): PowerShellBuilderWarning[] {
  const warnings: PowerShellBuilderWarning[] = [];
  for (const stage of stages) {
    const verb = stage.cmdlet.split('-')[0]?.toLowerCase();
    if (verb && DESTRUCTIVE_VERBS.has(verb)) warnings.push(verbWarning(stage.cmdlet));
  }
  return warnings;
}

const REGISTRY_PATH = /(?:\b(?:HKLM|HKCU|HKCR|HKU|HKCC):|\bRegistry::|\bHKEY_[A-Z_]+\b)/i;
const REGISTRY_WRITE_CMDLET = /\b(?:Set|New|Remove|Clear|Rename|Copy|Move)-(?:ItemProperty|Item)\b/i;

/**
 * Best-effort static review of any PowerShell text (builder output or a free-typed script). Warnings only,
 * never a block: a regex cannot understand PowerShell, so absence of a warning is not a safety claim.
 */
export function analyzePowerShellScript(script: string): PowerShellBuilderWarning[] {
  const warnings: PowerShellBuilderWarning[] = [];
  const seen = new Set<string>();
  const add = (warning: PowerShellBuilderWarning) => {
    const key = `${warning.code}:${warning.cmdlet.toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); warnings.push(warning); }
  };
  for (const match of script.matchAll(/(?<![\w$-])([A-Za-z]+)-([A-Za-z][A-Za-z0-9]*)(?![\w-])/g)) {
    if (DESTRUCTIVE_VERBS.has(match[1].toLowerCase())) add(verbWarning(match[0]));
  }
  for (const match of script.matchAll(/(?<![\w$-])(Invoke-Expression|iex)(?![\w-])/gi)) {
    add({ code: 'code-eval', cmdlet: match[1], message: `${match[1]} runs text as code, so the effect cannot be read from this script alone.` });
  }
  if (/Start-Process\b[^\r\n|;]*-Verb\s+['"]?RunAs\b/i.test(script)) {
    add({ code: 'elevation', cmdlet: 'Start-Process -Verb RunAs', message: 'Start-Process -Verb RunAs asks Windows to start another program with administrator rights.' });
  }
  if (REGISTRY_PATH.test(script) && REGISTRY_WRITE_CMDLET.test(script)) {
    add({ code: 'registry-write', cmdlet: 'registry', message: 'This script appears to change the Windows registry.' });
  }
  if (/(?<![\w$-])reg(?:\.exe)?\s+(?:add|delete|import|load|unload|copy|restore)\b/i.test(script)) {
    add({ code: 'registry-write', cmdlet: 'reg.exe', message: 'reg.exe is used to change the Windows registry.' });
  }
  return warnings;
}

/** Render an allowlisted catalog pipeline. Output is deterministic in stage and parameter order. */
export function buildPowerShellScript(
  stages: readonly PowerShellPipelineStage[],
  format: PowerShellOutputFormat,
  catalogEntries: readonly PowerShellCmdletDefinition[],
): PowerShellBuilderResult {
  if (stages.length === 0) throw new PowerShellBuilderError('Add at least one cmdlet stage.');
  const catalog = new Map<string, PowerShellCmdletDefinition>();
  for (const entry of catalogEntries) {
    if (!/^[A-Za-z][A-Za-z0-9]*-[A-Za-z][A-Za-z0-9]*$/.test(entry.name)) throw new PowerShellBuilderError('Catalog command has an unsafe name.');
    for (const set of entry.parameterSets) for (const parameter of set.parameters) {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(parameter.name)) throw new PowerShellBuilderError('Catalog parameter has an unsafe name.');
    }
    const key = entry.name.toLowerCase();
    if (catalog.has(key)) throw new PowerShellBuilderError(`Duplicate cmdlet in catalog: ${entry.name}.`);
    catalog.set(key, entry);
  }
  const parts = stages.map((stage) => renderStage(stage, catalog));
  const formatCommand = renderFormat(format);
  if (formatCommand) parts.push(formatCommand);
  const script = parts.join(' | ');
  return { script, utf8: new TextEncoder().encode(script), warnings: [...destructiveWarnings(stages), ...analyzePowerShellScript(script).filter((warning) => warning.code !== 'destructive-verb')] };
}
