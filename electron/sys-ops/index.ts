import type { SysOpDefinition } from '../sys-mutation';
import { registerEnvOps } from './env';
import { registerProcessOps } from './process';
import { registerRegistryOps } from './registry';
import { registerServiceOps } from './service';

/**
 * Op families plug into the engine here. `sys-mutation.ts` calls `registerBuiltinSysOps(registerSysOp)`
 * once, after its registry exists. Add a family by importing its `register�Ops` function and calling it
 * below; the engine itself never changes. Families: `./process` (process.end, .end-tree, .restart,
 * .suspend/.resume, .set-priority, .set-affinity, .dump); `./env`, `./registry`; later `./service`.
 */
export function registerBuiltinSysOps(register: <P>(def: SysOpDefinition<P>) => void): void {
  registerProcessOps(register);
  registerEnvOps(register);
  registerRegistryOps(register);
  registerServiceOps(register);
}
