/**
 * The Hub web's `X-DUDE-CSRF` token, in memory only. The admin adapter and the Hub-web boot each build their own
 * transport and used to keep their own token, so a cookie-session rotation (step-up, password change) in one left the
 * other holding a token the Hub no longer accepts. Both now read and write this one holder.
 */
let token: string | undefined;

export const hubCsrf = {
  get: (): string | undefined => token,
  set: (value: string | undefined): void => {
    token = value;
  },
  clear: (): void => {
    token = undefined;
  },
};
