import { runInternalWorkerIfRequested } from './worker-mode.js';
import { TEST_WORKER_JOB_HANDLERS } from './test-worker-handlers.js';

// esbuild entry for the worker specs: the real `runInternalWorkerIfRequested` (and so the real protocol) with test handlers.
void runInternalWorkerIfRequested(process.argv.slice(2), { jobHandlers: TEST_WORKER_JOB_HANDLERS }).then((code) => process.exit(code ?? 2));
