/**
 * Op families register themselves with `registerSysOp` (see `../sys-mutation.ts`) as an import side effect.
 * One file per family, e.g. `./process` (process.kill), `./registry` (registry.setValue), `./env`,
 * `./service`. Add the import below when a tool's milestone introduces its family; the engine itself
 * never changes. Currently no families ship.
 */
export {};
