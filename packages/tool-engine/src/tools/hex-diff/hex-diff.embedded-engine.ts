import { bytesToHexSpaced } from "../../shared/utils/byte-codec.js";
export function HexDiff_hex(bytes: Uint8Array | null): string {
    return bytes ? bytesToHexSpaced(bytes) : '';
}
export function HexDiff_offsetHex(offset: number): string {
    return offset.toString(16).padStart(8, '0');
}
