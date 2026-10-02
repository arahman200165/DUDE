import { ToolDefinition, ToolFileInput } from '../../shared/models/tool-definition.model';

/**
 * The text input a file can be loaded into for `tool`: its explicit `fileInput`, or — for the
 * tools that already declare an Explorer "Open with DUDE" destination — the same `desktopOpen`
 * input key and extensions, so those tools never need to declare the key twice.
 */
export function textFileInputOf(tool: ToolDefinition): ToolFileInput | undefined {
  if (tool.fileInput) return tool.fileInput;
  const open = tool.desktopOpen;
  return open?.inputKey && open.extensions?.length ? { key: open.inputKey, extensions: open.extensions } : undefined;
}

/**
 * Session flags a tool reads to treat file-sourced content more cautiously than typed content
 * (e.g. HTML Preview won't auto-run HTML that arrived from a file until the user approves it).
 * Keyed by extension, not tool id, and set on *every* path a file's text enters a tool —
 * Explorer open, Smart File Drop, and the shared Open file… button — so no path skips the gate.
 */
export function recordImportedFileFlags(fileName: string): void {
  const dot = fileName.lastIndexOf('.');
  const extension = dot < 0 ? '' : fileName.slice(dot).toLowerCase();
  if (extension === '.html' || extension === '.htm') sessionStorage.setItem('dude:desktop:html-preview-manual', 'true');
  if (extension === '.ts') sessionStorage.setItem('dude:desktop:typescript-notice', 'true');
  else if (extension === '.js') sessionStorage.removeItem('dude:desktop:typescript-notice');
}
