export type BackupErrorCode =
  | 'bad-magic'
  | 'bad-header'
  | 'unsupported-version'
  | 'wrong-passphrase-or-corrupt'
  | 'truncated'
  | 'integrity'
  | 'too-large'
  | 'bad-input';

/** Every failure of this package. Messages never contain the passphrase, key material or backup content. */
export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}
