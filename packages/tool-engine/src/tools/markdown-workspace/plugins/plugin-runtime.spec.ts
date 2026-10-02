import { PluginRuntimeClient } from "./plugin-runtime.js";

describe('PluginRuntimeClient', () => {
  it('resolves when a matching successful response arrives', async () => {
    const client = new PluginRuntimeClient();
    let sentRequestId = '';

    const promise = client.send((request) => {
      sentRequestId = request.requestId;
    }, 'hello');

    client.handleMessage({ requestId: sentRequestId, ok: true, output: 'HELLO' });

    expect(await promise).toBe('HELLO');
  });

  it('rejects when a matching error response arrives', async () => {
    const client = new PluginRuntimeClient();
    let sentRequestId = '';

    const promise = client.send((request) => {
      sentRequestId = request.requestId;
    }, 'hello');

    client.handleMessage({ requestId: sentRequestId, ok: false, error: 'boom' });

    await expect(promise).rejects.toThrow('boom');
  });

  it('ignores a response with an unrecognized requestId', async () => {
    const client = new PluginRuntimeClient();
    client.handleMessage({ requestId: 'unknown', ok: true, output: 'x' });
    expect(client.pendingCount).toBe(0);
  });

  it('ignores malformed message data', () => {
    const client = new PluginRuntimeClient();
    expect(() => client.handleMessage(null)).not.toThrow();
    expect(() => client.handleMessage('not an object')).not.toThrow();
    expect(() => client.handleMessage({ foo: 'bar' })).not.toThrow();
  });

  it('times out if no response arrives', async () => {
    vi.useFakeTimers();
    const client = new PluginRuntimeClient();
    const promise = client.send(() => {}, 'hello', 50);

    vi.advanceTimersByTime(60);
    await expect(promise).rejects.toThrow('Plugin timed out.');
    vi.useRealTimers();
  });

  it('sends the input in the request payload', () => {
    const client = new PluginRuntimeClient();
    const sent: string[] = [];
    void client.send((request) => sent.push(request.input), 'my-input').catch(() => {});
    expect(sent).toEqual(['my-input']);
  });

  it('generates distinct request ids for concurrent sends', async () => {
    const client = new PluginRuntimeClient();
    const ids: string[] = [];

    const p1 = client.send((r) => ids.push(r.requestId), 'a');
    const p2 = client.send((r) => ids.push(r.requestId), 'b');

    expect(new Set(ids).size).toBe(2);

    client.handleMessage({ requestId: ids[0], ok: true, output: 'A' });
    client.handleMessage({ requestId: ids[1], ok: true, output: 'B' });

    expect(await p1).toBe('A');
    expect(await p2).toBe('B');
  });
});
