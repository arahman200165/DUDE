import { computeFileHash, computeFileHashes, computeHash, computeHashes, createStreamingHasher, HASH_ALGORITHMS } from "./hash-compute.js";

describe('computeHash', () => {
  it('computes the known MD5 test vector for "abc"', async () => {
    expect(await computeHash('abc', 'MD5')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it('computes the known SHA-1 test vector for "abc"', async () => {
    expect(await computeHash('abc', 'SHA-1')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('computes the known SHA-256 test vector for "abc"', async () => {
    expect(await computeHash('abc', 'SHA-256')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('produces a 96-character hex digest for SHA-384', async () => {
    expect(await computeHash('abc', 'SHA-384')).toHaveLength(96);
  });

  it('produces a 128-character hex digest for SHA-512', async () => {
    expect(await computeHash('abc', 'SHA-512')).toHaveLength(128);
  });

  it('is deterministic for the same input', async () => {
    expect(await computeHash('hello world', 'SHA-256')).toBe(await computeHash('hello world', 'SHA-256'));
  });

  it('produces different digests for different input', async () => {
    expect(await computeHash('a', 'SHA-256')).not.toBe(await computeHash('b', 'SHA-256'));
  });
});

describe('computeHash — new algorithm families', () => {
  it('computes the known SHA3-256 test vector for "abc"', async () => {
    expect(await computeHash('abc', 'SHA3-256')).toBe(
      '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532',
    );
  });

  it('produces a 96-character hex digest for SHA3-384', async () => {
    expect(await computeHash('abc', 'SHA3-384')).toHaveLength(96);
  });

  it('produces a 128-character hex digest for SHA3-512', async () => {
    expect(await computeHash('abc', 'SHA3-512')).toHaveLength(128);
  });

  it('computes the known BLAKE2b test vector for "abc"', async () => {
    expect(await computeHash('abc', 'BLAKE2b')).toBe(
      'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923',
    );
  });

  it('computes the known BLAKE2s test vector for "abc"', async () => {
    expect(await computeHash('abc', 'BLAKE2s')).toBe(
      '508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982',
    );
  });

  it('computes the known BLAKE3 test vector for "abc"', async () => {
    expect(await computeHash('abc', 'BLAKE3')).toBe(
      '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85',
    );
  });

  it('computes the known xxHash32 test vector for empty input', async () => {
    expect(await computeHash('', 'XXH32')).toBe('02cc5d05');
  });

  it('computes the known xxHash64 test vector for empty input', async () => {
    expect(await computeHash('', 'XXH64')).toBe('ef46db3751d8e999');
  });

  it('computes the known CRC-32/ISO-HDLC check value for "123456789"', async () => {
    expect(await computeHash('123456789', 'CRC32')).toBe('cbf43926');
  });

  it('computes the known CRC-64/XZ check value for "123456789"', async () => {
    expect(await computeHash('123456789', 'CRC64')).toBe('995dc9bbdf1939fa');
  });

  it('is deterministic across repeated xxHash calls (cached WASM instance)', async () => {
    expect(await computeHash('hello', 'XXH64')).toBe(await computeHash('hello', 'XXH64'));
  });
});

describe('computeHashes', () => {
  it('computes multiple algorithms in the requested order', async () => {
    const results = await computeHashes('abc', ['MD5', 'SHA-1']);

    expect(results.map((r) => r.algorithm)).toEqual(['MD5', 'SHA-1']);
    expect(results[0].hex).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it('returns an empty array for an empty algorithm list', async () => {
    expect(await computeHashes('abc', [])).toEqual([]);
  });
});

describe('computeFileHash', () => {
  const abcBuffer = () => new TextEncoder().encode('abc').buffer;

  it('matches the string-based digest for the same bytes', async () => {
    expect(await computeFileHash(abcBuffer(), 'MD5')).toBe(await computeHash('abc', 'MD5'));
    expect(await computeFileHash(abcBuffer(), 'SHA-256')).toBe(await computeHash('abc', 'SHA-256'));
  });

  it('produces the known MD5 test vector for "abc"', async () => {
    expect(await computeFileHash(abcBuffer(), 'MD5')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});

describe('computeFileHashes', () => {
  it('computes multiple algorithms in the requested order for a buffer', async () => {
    const buffer = new TextEncoder().encode('abc').buffer;
    const results = await computeFileHashes(buffer, ['MD5', 'SHA-1']);

    expect(results.map((r) => r.algorithm)).toEqual(['MD5', 'SHA-1']);
    expect(results[0].hex).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});

describe('createStreamingHasher', () => {
  it('produces the same digest as the one-shot path for every algorithm, across uneven chunks', async () => {
    const bytes = new Uint8Array(70_001).map((_, index) => (index * 31 + 7) & 0xff);
    for (const algorithm of HASH_ALGORITHMS) {
      const hasher = await createStreamingHasher(algorithm);
      for (let offset = 0; offset < bytes.length; offset += 4099) hasher.update(bytes.subarray(offset, offset + 4099));
      expect(hasher.digest(), algorithm).toBe(await computeFileHash(bytes.buffer, algorithm));
    }
  });

  it('prefers an injected native hasher when it offers one', async () => {
    const hasher = await createStreamingHasher('SHA-256', () => ({ update: () => {}, digest: () => 'native' }));
    expect(hasher.digest()).toBe('native');
  });
});
