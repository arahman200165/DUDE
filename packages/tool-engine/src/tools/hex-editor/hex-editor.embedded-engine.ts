import { chunkIntoRows, formatHexByte, isPrintableAsciiByte, parseHexByte, setByteAt } from "./hex-editor-logic.js";
export function HexEditor_charFor(byte: number): string {
    return isPrintableAsciiByte(byte) ? String.fromCharCode(byte) : '.';
}
export function HexEditor_offsetHex(offset: number): string {
    return offset.toString(16).padStart(8, '0');
}
