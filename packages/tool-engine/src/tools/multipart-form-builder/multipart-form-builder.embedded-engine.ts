import { hostCrypto } from "@dude/crypto/host";

export function randomHex(byteCount: number): string {
    return Array.from(hostCrypto().getRandomValues(new Uint8Array(byteCount)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
