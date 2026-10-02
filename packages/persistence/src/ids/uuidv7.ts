const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Monotonic state (module level): when the clock repeats (or goes backwards) within a process,
// the 12-bit rand_a field is used as a counter so ids stay strictly ordered. On counter overflow
// the timestamp is advanced by 1 ms.
let lastTimestamp = -1;
let lastCounter = 0;

/** RFC 9562 UUIDv7. `randomBytes` and `now` are injected so the package uses no host globals. */
export function uuidv7(randomBytes: (n: number) => Uint8Array, now: () => number): string {
  const rand = randomBytes(10);
  if (rand.length < 10) throw new Error('uuidv7: randomBytes returned too few bytes');
  let ts = Math.floor(now());
  let counter: number;
  if (ts > lastTimestamp) {
    counter = ((rand[0] & 0x0f) << 8) | rand[1];
    // Keep headroom so a burst within one ms does not overflow immediately.
    if (counter > 0x7ff) counter -= 0x800;
  } else {
    ts = lastTimestamp;
    counter = lastCounter + 1;
    if (counter > 0xfff) { ts += 1; counter = 0; }
  }
  lastTimestamp = ts;
  lastCounter = counter;

  const bytes = new Uint8Array(16);
  let t = ts;
  for (let i = 5; i >= 0; i--) { bytes[i] = t % 256; t = Math.floor(t / 256); }
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | (rand[2] & 0x3f);
  for (let i = 9; i < 16; i++) bytes[i] = rand[i - 6];
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** True for an RFC 4122/9562 UUID string (any version, variant 10). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** True for any 8-4-4-4-12 hex string, regardless of version/variant. */
export function isUuidShaped(value: unknown): value is string {
  return typeof value === 'string' && ANY_UUID_RE.test(value);
}
