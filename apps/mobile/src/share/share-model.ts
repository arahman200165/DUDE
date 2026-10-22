import type { PasteDetector } from '@dude/domain/shared/models/paste-detector.model';
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
import { assertWithinLimit, DEFAULT_FILE_INPUT_BYTES, fileInputLimitFor, formatByteSize, type FileInputSource } from '../kit/file-io-core';
import type { MobileBindingMap } from '../registry/mobile-binding';

/**
 * Pure routing logic of Share-to-DUDE (Phase 31I PD-091). A shared payload is classified, matched to runnable tools and turned
 * into an in-memory tool-input prefill. Nothing here persists, synchronizes or runs a tool.
 */

/** Payload from the native `DudeShare` module (`getPendingShare`). */
export type IncomingShare =
  | { readonly kind: 'text'; readonly text: string; readonly subject?: string | null; readonly size?: number; readonly tooLarge?: boolean }
  | { readonly kind: 'file'; readonly name: string; readonly mimeType: string; readonly size: number; readonly base64?: string; readonly text?: string; readonly tooLarge?: boolean };

export type ShareClassification =
  | { readonly category: 'text'; readonly text: string; readonly size: number; readonly label: string }
  | { readonly category: 'image'; readonly base64: string; readonly mimeType: string; readonly size: number; readonly label: string }
  | { readonly category: 'unsupported'; readonly size: number; readonly label: string; readonly reason: string };

/** Only these tools read a shared image (they take `{ imageUri }` from the tool-input store). */
export const IMAGE_SHARE_TOOL_IDS: readonly string[] = ['qr-code-scanner', 'barcode-reader'];
/** Tools without a free-text input, plus the image-only scanners, are not offered for shared text. */
export const NO_TEXT_SHARE_TOOL_IDS: ReadonlySet<string> = new Set(['device-info', 'password-generator', 'chmod-converter', 'contrast-checker', ...IMAGE_SHARE_TOOL_IDS]);
/** Tools whose main text field is not named `input` in the tool-input store. */
const TEXT_INPUT_KEYS: Readonly<Record<string, string>> = { diff: 'left', regex: 'testText', 'timezone-offset-comparator': 'zonesText' };
/** Shapes whose preview is hidden (the content still routes to the tool the user picks). */
const SECRET_SHAPE_TOOLS: ReadonlySet<string> = new Set(['jwt', 'env-editor']);
const SECRET_TEXT = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|^\s*(?:authorization\s*:\s*)?(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}\s*$/i;
export const SHARE_PREVIEW_CHARS = 160;
export const SUGGESTION_LIMIT = 4;

export function classifyShare(share: IncomingShare): ShareClassification {
  if (share.kind === 'text') {
    const size = share.size ?? share.text.length;
    if (share.tooLarge) return { category: 'unsupported', size, label: 'Text', reason: `The shared text is ${formatByteSize(size)}, which is over the limit DUDE reads.` };
    return { category: 'text', text: share.text, size, label: 'Text' };
  }
  const label = share.name || 'Shared file';
  if (share.tooLarge) return { category: 'unsupported', size: share.size, label, reason: `"${label}" is ${formatByteSize(share.size)}, which is over the limit DUDE reads.` };
  if (typeof share.text === 'string') return { category: 'text', text: share.text, size: share.size, label };
  if (share.mimeType.toLowerCase().startsWith('image/') && share.base64) return { category: 'image', base64: share.base64, mimeType: share.mimeType, size: share.size, label };
  return { category: 'unsupported', size: share.size, label, reason: `"${label}" (${share.mimeType}) is not text or an image DUDE can open.` };
}

/** Bytes the native module may read: the largest `fileInput` limit of any runnable tool, never below the 2 MiB default. */
export function shareReadCap(runnableIds: readonly string[], metadata: readonly FileInputSource[]): number {
  return runnableIds.reduce((cap, id) => Math.max(cap, fileInputLimitFor(id, metadata).maxBytes), DEFAULT_FILE_INPUT_BYTES);
}

export function runnableToolIds(tools: readonly ToolMetadata[], bindings: MobileBindingMap): string[] {
  return tools.filter(tool => bindings[tool.id]).map(tool => tool.id);
}

/** Tool ids the picker may offer for this payload: images only reach the scanners; text reaches every runnable text tool. */
export function eligibleToolIds(classification: ShareClassification, runnableIds: readonly string[]): string[] {
  if (classification.category === 'image') return IMAGE_SHARE_TOOL_IDS.filter(id => runnableIds.includes(id));
  if (classification.category === 'text') return runnableIds.filter(id => !NO_TEXT_SHARE_TOOL_IDS.has(id));
  return [];
}

export interface ShareSuggestion { readonly toolId: string; readonly title: string; readonly reason: string }
type DetectShapes = (text: string, detectors: readonly PasteDetector[], getTool: (toolId: string) => ToolMetadata | undefined) => ReadonlyArray<{ readonly toolId: string; readonly title: string; readonly score: number }>;

/**
 * Smart Paste suggestions limited to eligible runnable tools. Non-eligible tools are hidden from `getTool` before ranking, so the
 * top four are all runnable (not the top four overall, then filtered).
 */
export function suggestShareTools(text: string, detect: DetectShapes, detectors: readonly PasteDetector[], tools: ReadonlyMap<string, ToolMetadata>, eligibleIds: readonly string[]): ShareSuggestion[] {
  const allowed = new Set(eligibleIds);
  const matches = detect(text, detectors, id => allowed.has(id) ? tools.get(id) : undefined);
  return matches.slice(0, SUGGESTION_LIMIT).map(match => ({ toolId: match.toolId, title: match.title, reason: `Looks like ${match.title} input (${Math.round(match.score * 100)}% match)` }));
}

/** The preview is hidden when Smart Paste classifies the text as a secret-like shape (JWT, dotenv) or it holds a private key or bearer credential. */
export function shouldRedactPreview(text: string, matchedToolIds: readonly string[]): boolean {
  return matchedToolIds.some(id => SECRET_SHAPE_TOOLS.has(id)) || SECRET_TEXT.test(text);
}

export function sharePreview(text: string, redact: boolean): string {
  if (redact) return 'Hidden: this looks like a secret. It is only handed to the tool you pick.';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > SHARE_PREVIEW_CHARS ? `${flat.slice(0, SHARE_PREVIEW_CHARS)}…` : flat;
}

export type SharePlan =
  | { readonly ok: true; readonly toolId: string; readonly prefill: Readonly<Record<string, unknown>>; readonly image?: { readonly base64: string; readonly mimeType: string } }
  | { readonly ok: false; readonly reason: string };

/** Validates the chosen tool against the payload and the tool's own `fileInput` cap, and builds the in-memory prefill. */
export function planShare(classification: ShareClassification, toolId: string, runnableIds: readonly string[], metadata: readonly FileInputSource[]): SharePlan {
  if (classification.category === 'unsupported') return { ok: false, reason: classification.reason };
  if (!eligibleToolIds(classification, runnableIds).includes(toolId)) {
    return { ok: false, reason: classification.category === 'image' ? 'A shared image can only be opened in the QR Code Scanner or Barcode Reader.' : 'This tool cannot take shared text.' };
  }
  const maxBytes = classification.category === 'image' ? DEFAULT_FILE_INPUT_BYTES : fileInputLimitFor(toolId, metadata).maxBytes;
  try { assertWithinLimit(classification.label, classification.size, maxBytes); } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : 'The shared content is too large for this tool.' }; }
  if (classification.category === 'image') return { ok: true, toolId, prefill: {}, image: { base64: classification.base64, mimeType: classification.mimeType } };
  return { ok: true, toolId, prefill: { [TEXT_INPUT_KEYS[toolId] ?? 'input']: classification.text } };
}

/** File extension for the cache copy of a shared image, from its MIME type. */
export function imageExtension(mimeType: string): string {
  const subtype = mimeType.toLowerCase().split('/')[1]?.split(';')[0] ?? '';
  const known: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', bmp: 'bmp', heic: 'heic', heif: 'heif', avif: 'avif' };
  return known[subtype] ?? 'img';
}
