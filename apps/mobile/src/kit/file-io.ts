import { Share } from 'react-native';
import { assertWithinLimit, DEFAULT_FILE_INPUT_BYTES, FileInputError, sanitizeFileName, validateTextContent } from './file-io-core';

export { DEFAULT_FILE_INPUT_BYTES, defaultOutputName, fileInputLimitFor, FileInputError, sanitizeFileName } from './file-io-core';
export type { FileInputLimit } from './file-io-core';

/**
 * Android file I/O for the tool kit (Phase 31I decisions 8 and 11). Every entry point opens a system UI the user drives, so
 * DUDE holds no storage or media permission: text files come from the Storage Access Framework document picker, images from
 * the Photo Picker (`expo-image-picker`, non-legacy) and saved files go to a folder the user picks (`Directory.pickDirectoryAsync`,
 * also SAF). Native modules load lazily so a host without them degrades to an error instead of a crash.
 */

export interface PickedTextFile { readonly name: string; readonly mimeType: string; readonly text: string; readonly size: number }
export interface PickedImage { readonly uri: string; readonly width: number; readonly height: number; readonly mimeType: string | undefined; readonly fileName: string | undefined }
export type SaveResult = { readonly status: 'saved'; readonly name: string; readonly uri: string } | { readonly status: 'cancelled' };

const isCancel = (error: unknown): boolean => /cancel/i.test(String((error as { code?: unknown; message?: unknown } | null)?.code ?? '') + String((error as { message?: unknown } | null)?.message ?? ''));

/**
 * Opens the SAF document picker, copies the choice to the app cache, enforces `maxBytes` (before and after the read) and
 * returns its UTF-8 text, or `null` when the user cancels. Rejects with a `FileInputError` for oversized, binary or UTF-16 files.
 * The cache copy is deleted afterwards.
 */
export async function pickTextFile({ maxBytes = DEFAULT_FILE_INPUT_BYTES, mimeTypes = '*/*' }: { readonly maxBytes?: number; readonly mimeTypes?: string | readonly string[] } = {}): Promise<PickedTextFile | null> {
  const [picker, system] = await Promise.all([import('expo-document-picker'), import('expo-file-system')]);
  const result = await picker.getDocumentAsync({ type: typeof mimeTypes === 'string' ? mimeTypes : [...mimeTypes], copyToCacheDirectory: true, multiple: false });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const file = new system.File(asset.uri);
  try {
    assertWithinLimit(asset.name, asset.size ?? file.size, maxBytes);
    const text = validateTextContent(asset.name, await file.text());
    return { name: asset.name, mimeType: asset.mimeType ?? 'text/plain', text, size: asset.size ?? file.size };
  } finally {
    try { if (file.exists) file.delete(); } catch { /* the cache is cleared by the OS anyway */ }
  }
}

/** Opens the Android Photo Picker (no storage or media permission) for one image. Resolves null when cancelled. */
export async function pickImage(): Promise<PickedImage | null> {
  const picker = await import('expo-image-picker');
  const result = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, allowsMultipleSelection: false, legacy: false, quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, width: asset.width, height: asset.height, mimeType: asset.mimeType, fileName: asset.fileName ?? undefined };
}

async function writeToChosenFolder(name: string, mimeType: string, write: (file: import('expo-file-system').File) => void): Promise<SaveResult> {
  const system = await import('expo-file-system');
  let directory: import('expo-file-system').Directory;
  try { directory = await system.Directory.pickDirectoryAsync(); } catch (error) {
    if (isCancel(error)) return { status: 'cancelled' };
    throw error;
  }
  const safeName = sanitizeFileName(name);
  const file = directory.createFile(safeName, mimeType);
  write(file);
  return { status: 'saved', name: file.name || safeName, uri: file.uri };
}

/** Saves UTF-8 text into a folder the user picks (SAF). The name is sanitised. */
export function saveTextFile(name: string, text: string, mimeType = 'text/plain'): Promise<SaveResult> {
  return writeToChosenFolder(name, mimeType, file => file.write(text));
}

/** Saves base64 data (for example a PNG) into a folder the user picks (SAF). */
export function saveBase64File(name: string, base64: string, mimeType = 'image/png'): Promise<SaveResult> {
  const payload = base64.replace(/^data:[^;]+;base64,/, '');
  return writeToChosenFolder(name, mimeType, file => file.write(payload, { encoding: 'base64' }));
}

/** Opens the share sheet for a `file://` URI (for example a generated image in the cache). */
export async function shareFile(uri: string, mimeType: string, dialogTitle?: string): Promise<void> {
  const sharing = await import('expo-sharing');
  if (!await sharing.isAvailableAsync()) throw new FileInputError('Sharing is not available on this device.');
  await sharing.shareAsync(uri, { mimeType, dialogTitle });
}

/** Opens the share sheet with text. */
export async function shareText(text: string, title?: string): Promise<void> {
  await Share.share({ message: text, title });
}
