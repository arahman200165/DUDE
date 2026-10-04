import { classifyHubError } from './hub-web.types';

const protocolError = (status: number | undefined) => Object.assign(new Error('Hub returned a malformed answer'), { name: 'HubProtocolError', status });
const apiError = (status: number, code = 'x') => Object.assign(new Error('nope'), { name: 'HubApiError', status, code });

describe('classifyHubError', () => {
  it('treats a network failure as unreachable', () => {
    expect(classifyHubError(new TypeError('Failed to fetch')).kind).toBe('unreachable');
  });

  it('treats a 5xx without a Hub error envelope (service-worker 504, proxy 502/503) as unreachable, not incompatible', () => {
    expect(classifyHubError(protocolError(504)).kind).toBe('unreachable');
    expect(classifyHubError(protocolError(502)).kind).toBe('unreachable');
  });

  it('keeps a malformed answer of a healthy status as incompatible', () => {
    expect(classifyHubError(protocolError(200)).kind).toBe('incompatible');
    expect(classifyHubError(protocolError(undefined)).kind).toBe('incompatible');
  });

  it('classifies Hub error envelopes by status and code', () => {
    expect(classifyHubError(apiError(401)).kind).toBe('unauthorized');
    expect(classifyHubError(apiError(410)).kind).toBe('cursor-expired');
    expect(classifyHubError(apiError(409, 'not-attached')).kind).toBe('not-attached');
    expect(classifyHubError(apiError(426)).kind).toBe('incompatible');
    expect(classifyHubError(apiError(503)).kind).toBe('unreachable');
    expect(classifyHubError(apiError(400)).kind).toBe('rejected');
  });
});
