import type { AgentHubEnrollError } from '@dude/contracts';

export type HubManagerErrorCode =
  | AgentHubEnrollError
  | 'not-enrolled'
  | 'enrollment-revoked'
  | 'owner-not-signed-in'
  | 'owner-session-expired'
  | 'tls-untrusted';

/** A typed, user-presentable failure of the Hub connection layer. The message never carries credentials. */
export class HubManagerError extends Error {
  constructor(readonly code: HubManagerErrorCode, message: string) {
    super(message);
    this.name = 'HubManagerError';
  }
}
