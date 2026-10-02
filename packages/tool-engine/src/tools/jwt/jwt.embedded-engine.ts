import { JwtExpiryStatus, decodeJwt, decodeTemporalClaim } from "./jwt-decode.js";
export const EXPIRY_BADGE_CLASSES: Record<JwtExpiryStatus['kind'], string> = {
    expired: 'border-error/40 bg-error/10 text-error',
    valid: 'border-success/40 bg-success/10 text-success',
    'no-claim': 'border-border text-text-muted',
};
export function Jwt_format(value: unknown): string {
    return JSON.stringify(value, null, 2);
}
export function Jwt_expiryBadgeClasses(kind: JwtExpiryStatus['kind']): string {
    return EXPIRY_BADGE_CLASSES[kind];
}
