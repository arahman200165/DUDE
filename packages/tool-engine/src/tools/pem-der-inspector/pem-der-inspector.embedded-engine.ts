import { bytesToHex } from "../../shared/utils/byte-codec.js";
export function PemDerInspector_hex(bytes: Uint8Array): string {
    return bytesToHex(bytes);
}
