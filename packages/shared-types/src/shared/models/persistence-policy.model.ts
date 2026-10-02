/**
 * `secure-local` is declarative-documentation only in a registry entry —
 * it's async-only (OS keychain, desktop-only) and deliberately not wired
 * into `PersistenceService.signal()`'s synchronous model. Use
 * `SecureLocalService` directly for it.
 */
export type PersistencePolicy = 'none' | 'session' | 'local' | 'user-choice' | 'secure-local';
