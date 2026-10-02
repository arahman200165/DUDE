import { randomBytes } from 'node:crypto';
import { uuidv7 } from '@dude/persistence';

/** A UUIDv7 using the host CSPRNG and clock. */
export const newId = (now: () => number = Date.now): string => uuidv7((n) => randomBytes(n), now);
