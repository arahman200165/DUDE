import { appStatusLabel, appTypeLabel, canRelease, endOwnerRequest, rebootNeeded, releaseRequest } from './file-lock-inspector-logic';

const owner = { pid: 10, startKey: '1', name: 'Word', service: '', applicationType: 1, restartable: true, appStatus: 1, sessionId: 1 };

describe('file lock inspector logic', () => {
  it('labels Restart Manager app types and statuses', () => {
    expect(appTypeLabel(3)).toBe('Service');
    expect(appTypeLabel(77)).toBe('Type 77');
    expect(appStatusLabel(0x11)).toBe('running, error on stop');
  });
  it('builds exact plan requests', () => {
    expect(releaseRequest('C:\a.txt', true).ops).toEqual([{ kind: 'lock.release', params: { path: 'C:\a.txt', restartAfter: true } }]);
    expect(endOwnerRequest('C:\a.txt', owner).ops[0]).toEqual({ kind: 'lock.end-owner', params: { path: 'C:\a.txt', pid: 10, startKey: '1', name: 'Word' } });
  });
  it('refuses graceful release when a critical process is an owner', () => {
    expect(canRelease([owner])).toBe(true);
    expect(canRelease([owner, { ...owner, applicationType: 1000 }])).toBe(false);
    expect(canRelease([])).toBe(false);
    expect(rebootNeeded(0)).toBe(false);
  });
});
