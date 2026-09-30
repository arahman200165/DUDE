/** Tiny bounds-checked PE reader. Kept framework-free for renderer and Electron consumers. */
export function dataViewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

export function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

export function readUint64(view: DataView, offset: number): bigint {
  return view.getBigUint64(offset, true);
}
