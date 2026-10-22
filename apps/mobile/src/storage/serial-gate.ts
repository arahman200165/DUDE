const noop = (): void => undefined;

/**
 * FIFO gate: at most one native database operation (a statement or a whole exclusive transaction) is in flight, and a close
 * waits for everything queued before it.
 *
 * Why: expo-sqlite 57.0.3 runs one JS statement call (prepare, run, getColumnNames, getAll, finalize) as several separate native
 * calls on a thread pool, and its `closeAsync` runs `sqlite3_finalize_all_statement` without marking the Kotlin statements
 * finalized or waiting for them. `getColumnNamesAsync` does not even check that the database is open. A statement chain that is
 * in flight when its connection closes therefore keeps using freed `sqlite3_stmt` memory and dies with SIGSEGV, fault address
 * 0xfd66 inside pthread_mutex_lock, called from `NativeStatementBinding::getColumnNames`, `exsqlite3_reset` or `exsqlite3_step`
 * (seen on API 29 and 36 on first boot, when the first reads overlap the workbench being torn down or boot failing; reproduced
 * deterministically on an emulator with six `getAllAsync` calls racing `closeAsync`, 2 of 2 runs of 300 iterations crashed, the first at
 * iteration 86, and 3 runs through this gate did not crash). No upstream fix exists in expo-sqlite 57.0.3, so the app serializes access itself.
 *
 * Work run through the gate must never await another gated call (that would deadlock); transaction bodies use their own
 * transaction handle.
 */
export class SerialGate {
  private tail: Promise<void> = Promise.resolve();
  private closed = false;

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The database is closed.'));
    return this.enqueue(work);
  }

  /** Runs `work` after everything already queued, then rejects every later call. */
  close<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The database is closed.'));
    const result = this.enqueue(work);
    this.closed = true;
    return result;
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.then(noop, noop);
    return result;
  }
}
