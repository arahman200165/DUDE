import { decodeParquet } from "./parquet-decode.js";

/**
 * Pre-generated with `hyparquet-writer`'s `parquetWriteBuffer` outside the
 * test run (see the milestone commit message) — `hyparquet-writer` itself
 * doesn't behave correctly under this project's jsdom test environment, so
 * fixtures are baked in as static bytes rather than generated live.
 */
const NAME_AGE_TABLE_BASE64 =
  'UEFSMRUGFSQVKFwVBBUAFQQVABUEFQAAAAMDEDwFAAAAQWxpY2UDAAAAQm9iFQYVFBUYXBUEFQAVBBUAFQQVAAAAAwMIHB4AAAAZAAAAFQQZPEgEcm9vdBUEABUMJQIYBG5hbWUlAAAVAiUCGANhZ2UAFgQZHBksJggcFQwZFQAZGARuYW1lFQIWBBZSFlImCDw2ACgDQm9iGAVBbGljZQAZHBUGFQAVAgAAACZaHBUCGRUAGRgDYWdlFQIWBBZCFkImWjw2ACgEHgAAABgEGQAAAAAZHBUGFQAVAgAAABaUARYEACgJaHlwYXJxdWV0AKMAAABQQVIx';
const NULLABLE_AGE_TABLE_BASE64 =
  'UEFSMRUGFQwVEFwVBBUCFQQVABUEFQAAAAMBBAweAAAAFQQZLEgEcm9vdBUCABUCJQIYA2FnZQAWBBkcGRwmCBwVAhkVABkYA2FnZRUCFgQWOhY6Jgg8NgIoBB4AAAAYBB4AAAAAGRwVBhUAFQIAAAAWOhYEACgJaHlwYXJxdWV0AGEAAABQQVIx';

function bytesFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

describe('decodeParquet', () => {
  it('decodes rows into a table with a column for every field', async () => {
    const result = await decodeParquet(bytesFromBase64(NAME_AGE_TABLE_BASE64));

    expect(result).toEqual({
      ok: true,
      table: {
        columns: ['name', 'age'],
        rows: [
          ['Alice', '30'],
          ['Bob', '25'],
        ],
      },
    });
  });

  it('renders a null cell as an empty string', async () => {
    const result = await decodeParquet(bytesFromBase64(NULLABLE_AGE_TABLE_BASE64));

    expect(result).toEqual({ ok: true, table: { columns: ['age'], rows: [['30'], ['']] } });
  });

  it('rejects an empty file', async () => {
    expect((await decodeParquet(new Uint8Array(0))).ok).toBe(false);
  });

  it('reports an error for bytes that are not a valid Parquet file', async () => {
    const result = await decodeParquet(new Uint8Array([1, 2, 3, 4, 5]));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });
});
