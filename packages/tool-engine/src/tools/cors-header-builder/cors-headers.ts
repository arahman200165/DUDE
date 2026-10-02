/**
 * Pure, framework-free parse/build for the CORS response headers (Fetch §3.2.1-3.2.6) —
 * unlike Cache-Control/CSP this is a *set* of separate headers, not one combined value, so
 * the raw representation is a multi-line header block (mirrors http-header-inspector).
 */
export interface CorsHeaders {
  readonly allowOrigin: string;
  readonly allowMethods: string;
  readonly allowHeaders: string;
  readonly allowCredentials: boolean;
  readonly maxAge: string;
  readonly exposeHeaders: string;
}

export const EMPTY_CORS: CorsHeaders = {
  allowOrigin: '',
  allowMethods: '',
  allowHeaders: '',
  allowCredentials: false,
  maxAge: '',
  exposeHeaders: '',
};

const FIELD_BY_HEADER_NAME: Record<string, keyof Omit<CorsHeaders, 'allowCredentials'>> = {
  'access-control-allow-origin': 'allowOrigin',
  'access-control-allow-methods': 'allowMethods',
  'access-control-allow-headers': 'allowHeaders',
  'access-control-max-age': 'maxAge',
  'access-control-expose-headers': 'exposeHeaders',
};

export function parseCorsHeaderText(raw: string): CorsHeaders {
  const patch: Record<string, string> = {};
  let allowCredentials = false;

  for (const line of raw.split('\n').map((l) => l.trim()).filter((l) => l !== '')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const name = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (name === 'access-control-allow-credentials') {
      allowCredentials = value.toLowerCase() === 'true';
      continue;
    }
    const field = FIELD_BY_HEADER_NAME[name];
    if (field) patch[field] = value;
  }

  return { ...EMPTY_CORS, ...patch, allowCredentials };
}

export function buildCorsHeaderText(cors: CorsHeaders): string {
  const lines: string[] = [];
  if (cors.allowOrigin !== '') lines.push(`Access-Control-Allow-Origin: ${cors.allowOrigin}`);
  if (cors.allowMethods !== '') lines.push(`Access-Control-Allow-Methods: ${cors.allowMethods}`);
  if (cors.allowHeaders !== '') lines.push(`Access-Control-Allow-Headers: ${cors.allowHeaders}`);
  if (cors.allowCredentials) lines.push('Access-Control-Allow-Credentials: true');
  if (cors.maxAge !== '') lines.push(`Access-Control-Max-Age: ${cors.maxAge}`);
  if (cors.exposeHeaders !== '') lines.push(`Access-Control-Expose-Headers: ${cors.exposeHeaders}`);
  return lines.join('\n');
}

export interface PreflightRequest {
  readonly origin: string;
  readonly method: string;
  readonly headers: string;
}

export interface PreflightResult {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

/** Evaluates whether a hypothetical request would pass CORS, construct-and-display only — never sends anything. */
export function evaluatePreflight(cors: CorsHeaders, request: PreflightRequest): PreflightResult {
  const reasons: string[] = [];

  const requestOrigin = request.origin.trim();
  const originOk = cors.allowOrigin === '*' || cors.allowOrigin.toLowerCase() === requestOrigin.toLowerCase();
  if (!originOk) {
    reasons.push(`Origin "${requestOrigin}" is not allowed by Access-Control-Allow-Origin ("${cors.allowOrigin || '(unset)'}").`);
  }

  if (cors.allowCredentials && cors.allowOrigin === '*') {
    reasons.push('Access-Control-Allow-Credentials cannot be combined with a wildcard ("*") Allow-Origin — browsers reject this combination.');
  }

  const requestMethod = request.method.trim();
  if (requestMethod !== '') {
    const allowedMethods = cors.allowMethods.split(',').map((m) => m.trim().toUpperCase()).filter((m) => m !== '');
    if (!allowedMethods.includes(requestMethod.toUpperCase())) {
      reasons.push(`Method "${requestMethod}" is not in Access-Control-Allow-Methods ("${cors.allowMethods || '(unset)'}").`);
    }
  }

  const allowedHeaders = cors.allowHeaders.split(',').map((h) => h.trim().toLowerCase()).filter((h) => h !== '');
  const requestedHeaders = request.headers.split(',').map((h) => h.trim().toLowerCase()).filter((h) => h !== '');
  const missingHeaders = requestedHeaders.filter((h) => !allowedHeaders.includes(h));
  if (missingHeaders.length > 0) {
    reasons.push(`Header(s) not allowed by Access-Control-Allow-Headers: ${missingHeaders.join(', ')}.`);
  }

  return { allowed: reasons.length === 0, reasons };
}
