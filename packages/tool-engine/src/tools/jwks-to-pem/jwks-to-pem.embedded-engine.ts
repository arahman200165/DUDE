import { JwksKeyEntry, PemConversionResult, convertAllToPem, parseJwksKeys } from "./jwks-to-pem-logic.js";
export type ConvertedKey = JwksKeyEntry & PemConversionResult;
export function JwksToPem_raw(key: ConvertedKey): string {
    return JSON.stringify(key.raw, null, 2);
}
