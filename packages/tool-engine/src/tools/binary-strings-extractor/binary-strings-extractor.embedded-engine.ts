
export function BinaryStringsExtractor_hexOffset(offset: number): string {
    return '0x' + offset.toString(16).padStart(8, '0');
}
