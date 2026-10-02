import { FrameDecoder, MAX_FRAME_BYTES, ProtocolError, encodeFrame } from './framing.js';
import { agentEndpoint } from './endpoint.js';

describe('framing', () => {
  it('round-trips JSON, including bytes as base64 and Buffers', () => {
    const message = { id: 1, params: { ciphertext: new Uint8Array([0, 1, 2, 255]), nested: [{ b: Buffer.from('hi') }], text: 'héllo' } };
    const frame = encodeFrame(message);
    expect(frame.readUInt32BE(0)).toBe(frame.length - 4);
    expect(JSON.parse(frame.subarray(4).toString('utf8')).params.ciphertext).toEqual({ $bytes: 'AAEC/w==' });
    const [decoded] = new FrameDecoder().push(frame) as Array<typeof message>;
    expect(decoded.params.ciphertext).toBeInstanceOf(Uint8Array);
    expect([...decoded.params.ciphertext]).toEqual([0, 1, 2, 255]);
    expect(Buffer.from(decoded.params.nested[0].b as Uint8Array).toString()).toBe('hi');
    expect(decoded.params.text).toBe('héllo');
  });

  it('reassembles frames split across arbitrary chunks and separates coalesced frames', () => {
    const frames = [{ n: 1 }, { n: 2, pad: 'x'.repeat(5000) }, { n: 3 }];
    const wire = Buffer.concat(frames.map((f) => encodeFrame(f)));
    const decoder = new FrameDecoder();
    const out: unknown[] = [];
    for (let i = 0; i < wire.length; i += 7) out.push(...decoder.push(wire.subarray(i, i + 7)));
    expect(out).toEqual(frames);
    expect(new FrameDecoder().push(wire)).toEqual(frames);
  });

  it('rejects an oversize length header before buffering the body', () => {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(MAX_FRAME_BYTES + 1, 0);
    expect(() => new FrameDecoder().push(header)).toThrowError(expect.objectContaining({ code: 'frame-too-large' }));
    expect(() => new FrameDecoder(10).push(encodeFrame({ long: 'x'.repeat(50) }))).toThrow(ProtocolError);
    expect(() => encodeFrame({ long: 'x'.repeat(50) }, 10)).toThrow(ProtocolError);
  });

  it('rejects empty and non-JSON frames', () => {
    expect(() => new FrameDecoder().push(Buffer.alloc(4))).toThrowError(expect.objectContaining({ code: 'invalid-frame' }));
    const body = Buffer.from('not json');
    const frame = Buffer.concat([Buffer.from([0, 0, 0, body.length]), body]);
    expect(() => new FrameDecoder().push(frame)).toThrowError(expect.objectContaining({ code: 'invalid-frame' }));
  });
});

describe('agentEndpoint', () => {
  it('is a per-store-dir pipe name on Windows and a socket path on POSIX', () => {
    const a = agentEndpoint('C:\\Users\\a\\AppData\\Roaming\\DUDE\\device-store', 'win32');
    expect(a).toMatch(/^\\\\\.\\pipe\\dude-agent-[0-9a-f]{20}$/);
    expect(agentEndpoint('c:\\users\\a\\appdata\\roaming\\dude\\device-store', 'win32')).toBe(a);
    expect(agentEndpoint('C:\\Users\\b\\AppData\\Roaming\\DUDE\\device-store', 'win32')).not.toBe(a);
    expect(agentEndpoint('/home/a/.config/dude/device-store', 'linux')).toMatch(/agent\.sock$/);
    expect(agentEndpoint(`/${'long/'.repeat(30)}store`, 'linux')).toMatch(/dude-agent-[0-9a-f]{20}\.sock$/);
  });
});
