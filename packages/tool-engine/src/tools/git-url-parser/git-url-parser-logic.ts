/** Pure, framework-free parsing of git remote URLs (https/http, ssh://, git://, and the scp-like git@host:owner/repo form) into host/owner/repo. */

export type GitUrlProtocol = 'https' | 'http' | 'ssh' | 'git' | 'scp';

export interface GitUrlParts {
  readonly protocol: GitUrlProtocol;
  readonly user?: string;
  readonly host: string;
  readonly port?: number;
  readonly owner: string;
  readonly repo: string;
}

export type ParseGitUrlResult = { readonly ok: true; readonly value: GitUrlParts } | { readonly ok: false; readonly error: string };

const HTTPS_RE = /^(https?):\/\/(?:([^@/]+)@)?([^/:]+)(?::(\d+))?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;
const SSH_RE = /^ssh:\/\/(?:([^@/]+)@)?([^/:]+)(?::(\d+))?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;
const GIT_PROTOCOL_RE = /^git:\/\/([^/:]+)(?::(\d+))?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;
const SCP_RE = /^(?:([^@]+)@)?([^:]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

export function parseGitUrl(raw: string): ParseGitUrlResult {
  const input = raw.trim();
  if (input === '') return { ok: false, error: 'Enter a git remote URL.' };

  const https = HTTPS_RE.exec(input);
  if (https) {
    return {
      ok: true,
      value: {
        protocol: https[1] as 'http' | 'https',
        user: https[2] || undefined,
        host: https[3],
        port: https[4] ? Number(https[4]) : undefined,
        owner: https[5],
        repo: https[6],
      },
    };
  }

  const ssh = SSH_RE.exec(input);
  if (ssh) {
    return {
      ok: true,
      value: {
        protocol: 'ssh',
        user: ssh[1] || undefined,
        host: ssh[2],
        port: ssh[3] ? Number(ssh[3]) : undefined,
        owner: ssh[4],
        repo: ssh[5],
      },
    };
  }

  const gitProtocol = GIT_PROTOCOL_RE.exec(input);
  if (gitProtocol) {
    return {
      ok: true,
      value: { protocol: 'git', host: gitProtocol[1], port: gitProtocol[2] ? Number(gitProtocol[2]) : undefined, owner: gitProtocol[3], repo: gitProtocol[4] },
    };
  }

  const scp = SCP_RE.exec(input);
  if (scp) {
    return { ok: true, value: { protocol: 'scp', user: scp[1] || undefined, host: scp[2], owner: scp[3], repo: scp[4] } };
  }

  return { ok: false, error: 'Unrecognized git URL format.' };
}
