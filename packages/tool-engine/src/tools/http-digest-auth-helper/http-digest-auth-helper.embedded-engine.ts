import { hostCrypto } from "@dude/crypto/host";

export function secureRandomHex(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    hostCrypto().getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
