/**
 * Framework-free text-file loading shared by every "Open file…" / drop-onto-input / Smart File
 * Drop text hand-off path, so they all accept and reject exactly the same files.
 */

/** Larger than any realistic hand-edited document; well past where a plain `<textarea>` bogs down. */
export const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

const BINARY_SNIFF_BYTES = 8192;

export type TextFileReadResult =
  | { readonly ok: true; readonly text: string; readonly name: string }
  | { readonly ok: false; readonly error: string };

/**
 * A NUL byte in the leading chunk is the same heuristic `git` and `grep` use to call a file
 * binary. UTF-16 text (which is full of NULs) is caught here too; its BOM is checked first so it
 * gets a precise message instead of a misleading "binary" one.
 */
export function describeBinaryPrefix(prefix: Uint8Array): string | null {
  if ((prefix[0] === 0xff && prefix[1] === 0xfe) || (prefix[0] === 0xfe && prefix[1] === 0xff)) {
    return 'is UTF-16 encoded — re-save it as UTF-8 to open it here.';
  }
  return prefix.includes(0) ? "looks like a binary file, not text." : null;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads `file` as UTF-8 text (a UTF-8 BOM is stripped), or explains why it can't be. */
export async function readTextFile(file: File, maxBytes = MAX_TEXT_FILE_BYTES): Promise<TextFileReadResult> {
  if (file.size > maxBytes) {
    return { ok: false, error: `"${file.name}" is ${formatByteSize(file.size)} — the limit for text input is ${formatByteSize(maxBytes)}.` };
  }
  const prefix = new Uint8Array(await file.slice(0, BINARY_SNIFF_BYTES).arrayBuffer());
  const binary = describeBinaryPrefix(prefix);
  if (binary) return { ok: false, error: `"${file.name}" ${binary}` };
  return { ok: true, text: await file.text(), name: file.name };
}

/** `extensions` joined into an `<input type="file" accept>` value; empty means "any file". */
export function acceptFromExtensions(extensions: readonly string[] | undefined): string {
  return extensions?.join(',') ?? '';
}

function splitName(fileName: string): { base: string; extension: string } {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? { base: fileName.slice(0, dot), extension: fileName.slice(dot) } : { base: fileName, extension: '' };
}

/**
 * The Save dialog's suggested name: an explicit name wins; otherwise the opened file's base name
 * (so `notes.md` saves back as `notes.md`, or `config.yaml` -> `config.json` when the output format
 * differs), falling back to `fallbackBase` (the tool id) — with `extension`, else the opened file's
 * own extension, else `fallbackExtension`, else `.txt`.
 */
export function suggestSaveName(options: {
  readonly explicit?: string;
  readonly openedName?: string | null;
  readonly extension?: string;
  readonly fallbackBase: string;
  readonly fallbackExtension?: string;
}): string {
  if (options.explicit) return options.explicit;
  // Same format as what was opened: save it back under exactly its own name — including names
  // with no extension (`Dockerfile`) or dotfiles (`.env`), which must never grow a second one.
  if (options.openedName && options.extension === undefined) return options.openedName;
  const opened = options.openedName ? splitName(options.openedName) : null;
  const base = opened?.base || options.fallbackBase;
  const extension = options.extension ?? (options.fallbackExtension || '.txt');
  return `${base}${extension}`;
}
