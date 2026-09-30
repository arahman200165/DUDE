import type { PowerShellHashtable, PowerShellParameterType, PowerShellParameterValue } from '../../../shared-logic/system/powershell-builder';

/** A parameter row as typed in the UI: always text (or a boolean choice), converted per catalog type. */
export interface ParameterDraft { readonly name: string; readonly raw: string }
export interface StageDraft { readonly cmdlet: string; readonly parameters: readonly ParameterDraft[] }

function scalar(text: string): string | number | boolean {
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text.trim() !== '' && Number.isFinite(Number(text))) return Number(text);
  return text;
}

/** Converts UI text to the value the pure builder renders. Throws a readable message for unusable input. */
export function draftValue(type: PowerShellParameterType, raw: string): PowerShellParameterValue {
  switch (type) {
    case 'boolean':
    case 'switch': return raw === 'true';
    case 'number': {
      if (raw.trim() === '' || !Number.isFinite(Number(raw))) throw new Error('Enter a number.');
      return Number(raw);
    }
    case 'string[]': return raw.split(/\r?\n/).filter((line) => line.length > 0);
    case 'number[]': {
      const parts = raw.split(/[\s,]+/).filter(Boolean).map(Number);
      if (parts.some((part) => !Number.isFinite(part))) throw new Error('Enter numbers separated by commas or spaces.');
      return parts;
    }
    case 'hashtable': {
      const table: Record<string, string | number | boolean> = {};
      for (const line of raw.split(/\r?\n/).filter((entry) => entry.trim().length > 0)) {
        const index = line.indexOf('=');
        if (index < 1) throw new Error('Hashtable lines look like key=value.');
        table[line.slice(0, index).trim()] = scalar(line.slice(index + 1).trim());
      }
      return table as PowerShellHashtable;
    }
    default: return raw;
  }
}

/** A script restored from history goes to the editor only; this is the whole restore path. */
export function savedScriptFor(saved: Readonly<Record<string, { readonly script: string }>>, sha256: string): string | undefined {
  return saved[sha256]?.script;
}
