import { BackupError } from './backup-error.js';
import { concatBytes } from './backup-format.js';
import type { ObjectSink, ObjectSource, ObjectWriteStream } from './backup-v2-stream.js';

export interface MemoryBackupStore {
  sink: ObjectSink;
  source: ObjectSource;
  /** Committed objects by name (tests may tamper with them). */
  objects: Map<string, Uint8Array>;
}

/**
 * A write-once in-memory object store for specs and small tools: `create` refuses an existing or in-flight name,
 * `read` yields `pieceBytes` slices so readers see a real stream.
 */
export function createMemoryBackupStore(options: { pieceBytes?: number } = {}): MemoryBackupStore {
  const pieceBytes = options.pieceBytes ?? 65536;
  const objects = new Map<string, Uint8Array>();
  const writing = new Set<string>();
  const sink: ObjectSink = {
    async create(name: string): Promise<ObjectWriteStream> {
      if (objects.has(name) || writing.has(name)) throw new BackupError('bad-input', 'A backup object with that name already exists.');
      writing.add(name);
      let parts: Uint8Array[] | null = [];
      return {
        async write(bytes: Uint8Array): Promise<void> {
          if (!parts) throw new BackupError('bad-input', 'The backup object is closed.');
          parts.push(bytes.slice());
        },
        async commit(): Promise<void> {
          if (!parts) throw new BackupError('bad-input', 'The backup object is closed.');
          objects.set(name, concatBytes(parts));
          parts = null;
          writing.delete(name);
        },
        async abort(): Promise<void> {
          parts = null;
          writing.delete(name);
        },
      };
    },
  };
  const source: ObjectSource = {
    read(name: string, start = 0): AsyncIterable<Uint8Array> {
      const object = objects.get(name);
      if (!object) throw new BackupError('integrity', 'A backup object is missing.');
      return (async function* () {
        for (let at = start; at < object.length; at += pieceBytes) yield object.subarray(at, Math.min(object.length, at + pieceBytes));
      })();
    },
  };
  return { sink, source, objects };
}
