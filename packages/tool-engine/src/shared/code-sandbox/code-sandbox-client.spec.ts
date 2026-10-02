import { CodeSandboxClient } from "./code-sandbox-client.js";
import { SandboxEvent } from "@dude/contracts/sandbox/code-sandbox-protocol";

describe('CodeSandboxClient', () => {
  it('streams log events then a terminal result to the same run', () => {
    const client = new CodeSandboxClient();
    const events: SandboxEvent[] = [];
    let sentRequestId = '';

    client.run(
      (request) => {
        sentRequestId = request.requestId;
      },
      'console.log(1)',
      1000,
      (event) => events.push(event),
    );

    client.handleMessage({ kind: 'log', requestId: sentRequestId, level: 'log', args: ['1'] });
    client.handleMessage({ kind: 'result', requestId: sentRequestId, value: 'undefined', durationMs: 5 });

    expect(events.map((e) => e.kind)).toEqual(['log', 'result']);
    expect(client.pendingCount).toBe(0);
  });

  it('cleans up on a terminated event without ever resolving a result', () => {
    const client = new CodeSandboxClient();
    const events: SandboxEvent[] = [];
    let sentRequestId = '';

    client.run(
      (request) => {
        sentRequestId = request.requestId;
      },
      'while(true){}',
      50,
      (event) => events.push(event),
    );

    client.handleMessage({ kind: 'terminated', requestId: sentRequestId, reason: 'timeout' });

    expect(events).toEqual([{ kind: 'terminated', requestId: sentRequestId, reason: 'timeout' }]);
    expect(client.pendingCount).toBe(0);
  });

  it('ignores a message with an unrecognized requestId', () => {
    const client = new CodeSandboxClient();
    client.handleMessage({ kind: 'result', requestId: 'unknown', value: null, durationMs: 0 });
    expect(client.pendingCount).toBe(0);
  });

  it('ignores malformed message data', () => {
    const client = new CodeSandboxClient();
    expect(() => client.handleMessage(null)).not.toThrow();
    expect(() => client.handleMessage('not an object')).not.toThrow();
    expect(() => client.handleMessage({ foo: 'bar' })).not.toThrow();
  });

  it('sends a cancel request for the given run', () => {
    const client = new CodeSandboxClient();
    const sent: unknown[] = [];
    const handle = client.run(
      (request) => sent.push(request),
      'while(true){}',
      1000,
      () => {},
    );

    handle.cancel();

    expect(sent).toEqual([
      { kind: 'run', requestId: handle.requestId, code: 'while(true){}', timeoutMs: 1000 },
      { kind: 'cancel', requestId: handle.requestId },
    ]);
  });

  it('generates distinct request ids for concurrent runs', () => {
    const client = new CodeSandboxClient();
    const h1 = client.run(() => {}, 'a', 1000, () => {});
    const h2 = client.run(() => {}, 'b', 1000, () => {});
    expect(h1.requestId).not.toBe(h2.requestId);
  });
});
