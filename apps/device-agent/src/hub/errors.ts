import type { AgentHubBootstrapError, AgentHubEnrollError } from '@dude/contracts';

export type HubManagerErrorCode =
  | AgentHubEnrollError
  | AgentHubBootstrapError
  | 'not-enrolled'
  | 'enrollment-revoked'
  | 'owner-not-signed-in'
  | 'owner-session-expired'
  | 'tls-untrusted'
  | 'untrusted-tls'
  | 'authority-changed'
  | 'invalid-url'
  | 'hub-unreachable'
  | 'not-trusted'
  | 'owner-recovery-failed';

/** A typed, user-presentable failure of the Hub connection layer. The message never carries credentials. */
export class HubManagerError extends Error {
  constructor(readonly code: HubManagerErrorCode, message: string) {
    super(message);
    this.name = 'HubManagerError';
  }
}
