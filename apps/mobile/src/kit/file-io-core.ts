import { TOOL_METADATA } from '@dude/tool-registry';

/**
 * Pure (native-free) parts of the kit's file I/O: limit resolution, text validation and file-name sanitising.
 * `file-io.ts` wires them to the Android document picker, Photo Picker, Storage Access Framework and share sheet.
 */

/** Used when a manifest `fileInput` states no limit (it carries only the accepted extensions today). */
export const DEFAULT_FILE_INPUT_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_NAME_LENGTH = 100;
const BINARY_SNIFF_CHARS = 8192;

export interface FileInputLimit {
  /** The tool's manifest declares a text `fileInput`. */
  readonly supported: boolean;
  readonly maxBytes: number;
  /** Lower-case, dot-prefixed extensions from the manifest. */
  readonly extensions: readonly string[];
}

export interface FileInputSource { readonly id: string; readonly fileInput?: { readonly extensions: readonly string[]; readonly maxBytes?: number } }

/** The file-input limit of a tool: its manifest `fileInput` when present, else the default cap with `supported: false`. */
export function fileInputLimitFor(toolId: string, metadata: readonly FileInputSource[] = TOOL_METADATA as readonly FileInputSource[]): FileInputLimit {
  const input = metadata.find(tool => tool.id === toolId)?.fileInput;
  if (!input) return { supported: false, maxBytes: DEFAULT_FILE_INPUT_BYTES, extensions: [] };
  const declared = input.maxBytes;
  return { supported: true, maxBytes: typeof declared === 'number' && Number.isFinite(declared) && declared > 0 ? Math.floor(declared) : DEFAULT_FILE_INPUT_BYTES, extensions: input.extensions };
}

export class FileInputError extends Error {
  constructor(message: string) { super(message); this.name = 'FileInputError'; }
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Throws a `FileInputError` with a user-facing message when `size` exceeds `maxBytes`. An unknown size passes (re-check after reading). */
export function assertWithinLimit(name: string, size: number | null | undefined, maxBytes: number): void {
  if (typeof size === 'number' && size > maxBytes) throw new FileInputError(`"${name}" is ${formatByteSize(size)}; the limit for this tool is ${formatByteSize(maxBytes)}.`);
}

/** Rejects UTF-16 (a BOM decodes to two U+FFFD) and binary (NUL in the leading chunk) content, and strips a UTF-8 BOM. */
export function validateTextContent(name: string, text: string): string {
  if (text.startsWith('��')) throw new FileInputError(`"${name}" is UTF-16 encoded or binary; re-save it as UTF-8 to open it here.`);
  if (text.slice(0, BINARY_SNIFF_CHARS).includes('\u0000')) throw new FileInputError(`"${name}" looks like a binary file, not text.`);
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

const RESERVED_BASENAMES = new Set(['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'lpt1', 'lpt2', 'lpt3']);
const SIMPLE_EXTENSION = /^\.[a-z0-9]{1,10}$/i;

/**
 * A safe file name for a user-chosen save location: only the last path segment survives (no separators), control and
 * reserved characters are dropped, no leading dots or trailing dots/spaces, at most `MAX_FILE_NAME_LENGTH` characters,
 * and always a simple alphanumeric extension (`fallbackExtension`, default `.txt`, when the name has none).
 */
export function sanitizeFileName(name: string, fallbackBase = 'dude-output', fallbackExtension = '.txt'): string {
  const fallback = SIMPLE_EXTENSION.test(fallbackExtension) ? fallbackExtension.toLowerCase() : '.txt';
  const segment = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  const dot = segment.lastIndexOf('.');
  const hasExtension = dot > 0 && SIMPLE_EXTENSION.test(segment.slice(dot));
  const extension = hasExtension ? segment.slice(dot).toLowerCase() : fallback;
  let base = (hasExtension ? segment.slice(0, dot) : segment).replace(/\s+/g, ' ').replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (!base || RESERVED_BASENAMES.has(base.toLowerCase())) base = fallbackBase;
  return `${base.slice(0, MAX_FILE_NAME_LENGTH - extension.length)}${extension}`;
}

/** The default Save name of a tool's output: `<toolId>-output.txt`. */
export function defaultOutputName(toolId: string): string { return sanitizeFileName(`${toolId}-output.txt`); }
