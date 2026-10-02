import fc from 'fast-check';
import './engine-host.setup';
// None-policy workspace engines must never access browser storage. These assertions observe that boundary.
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: () => null,
  setItem: () => { throw Error('Portable engines cannot write browser storage'); },
} });
fc.configureGlobal({seed:20260923,numRuns:200});
