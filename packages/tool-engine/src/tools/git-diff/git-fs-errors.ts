/**
 * Shared error shape for both the web (`git-fs-shim.ts`, eager in-memory)
 * and desktop (`git-native-fs-client.ts`, lazy IPC-backed) `FsClient`
 * implementations. `isomorphic-git`'s internal object-lookup algorithm
 * (loose-object-vs-packfile fallback, ref resolution) branches on catching
 * `ENOENT` specifically, so both clients must throw this same shape.
 */
export class ReadOnlyFsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
