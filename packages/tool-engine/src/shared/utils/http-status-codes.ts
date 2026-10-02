/**
 * Transcribed from the IANA "Hypertext Transfer Protocol (HTTP) Status Code
 * Registry" (https://www.iana.org/assignments/http-status-codes), as of
 * 2026-09-20. Covers every currently-registered code, including two
 * reserved-but-unused ones (306, 418) kept for reference/historical value.
 */

export type HttpStatusCategory =
  | '1xx Informational'
  | '2xx Success'
  | '3xx Redirection'
  | '4xx Client Error'
  | '5xx Server Error';

export interface HttpStatusEntry {
  readonly code: number;
  readonly name: string;
  readonly description: string;
  readonly category: HttpStatusCategory;
}

export const HTTP_STATUS_CODES: readonly HttpStatusEntry[] = [
  // 1xx Informational
  {
    code: 100,
    name: 'Continue',
    category: '1xx Informational',
    description: 'The initial part of the request has been received and the client should continue.',
  },
  {
    code: 101,
    name: 'Switching Protocols',
    category: '1xx Informational',
    description: 'The server is complying with a request to switch protocols (e.g. to WebSocket).',
  },
  {
    code: 102,
    name: 'Processing',
    category: '1xx Informational',
    description: 'The server has accepted the full request but has not yet completed it (WebDAV).',
  },
  {
    code: 103,
    name: 'Early Hints',
    category: '1xx Informational',
    description: 'Preliminary headers (e.g. Link for preloading) sent before the final response.',
  },

  // 2xx Success
  { code: 200, name: 'OK', category: '2xx Success', description: 'The request succeeded.' },
  {
    code: 201,
    name: 'Created',
    category: '2xx Success',
    description: 'The request succeeded and a new resource was created as a result.',
  },
  {
    code: 202,
    name: 'Accepted',
    category: '2xx Success',
    description: 'The request has been accepted for processing, but processing is not yet complete.',
  },
  {
    code: 203,
    name: 'Non-Authoritative Information',
    category: '2xx Success',
    description: 'The request succeeded but the payload has been modified by a transforming proxy.',
  },
  {
    code: 204,
    name: 'No Content',
    category: '2xx Success',
    description: 'The request succeeded but there is no content to send in the response body.',
  },
  {
    code: 205,
    name: 'Reset Content',
    category: '2xx Success',
    description: 'The request succeeded and the client should reset the document view that sent it.',
  },
  {
    code: 206,
    name: 'Partial Content',
    category: '2xx Success',
    description: 'Only part of the requested resource is being delivered, per a Range header.',
  },
  {
    code: 207,
    name: 'Multi-Status',
    category: '2xx Success',
    description: 'Conveys multiple independent status codes for sub-requests (WebDAV).',
  },
  {
    code: 208,
    name: 'Already Reported',
    category: '2xx Success',
    description: 'Members of a WebDAV binding have already been enumerated in a previous reply.',
  },
  {
    code: 226,
    name: 'IM Used',
    category: '2xx Success',
    description: 'The response is a representation of the result of one or more instance manipulations.',
  },

  // 3xx Redirection
  {
    code: 300,
    name: 'Multiple Choices',
    category: '3xx Redirection',
    description: 'The request has more than one possible response; the user or agent should choose one.',
  },
  {
    code: 301,
    name: 'Moved Permanently',
    category: '3xx Redirection',
    description: 'The resource has been assigned a new permanent URI.',
  },
  {
    code: 302,
    name: 'Found',
    category: '3xx Redirection',
    description: 'The resource resides temporarily under a different URI.',
  },
  {
    code: 303,
    name: 'See Other',
    category: '3xx Redirection',
    description: 'The response to the request can be found under a different URI using a GET request.',
  },
  {
    code: 304,
    name: 'Not Modified',
    category: '3xx Redirection',
    description: 'The resource has not been modified since the version specified by the request headers.',
  },
  {
    code: 305,
    name: 'Use Proxy',
    category: '3xx Redirection',
    description: 'Deprecated. Originally required the resource to be accessed through a proxy.',
  },
  {
    code: 306,
    name: '(Unused)',
    category: '3xx Redirection',
    description: 'Reserved from an earlier HTTP/1.1 draft for a proxy-switching mode; no longer used.',
  },
  {
    code: 307,
    name: 'Temporary Redirect',
    category: '3xx Redirection',
    description: 'The resource resides temporarily under a different URI; the request method must not change.',
  },
  {
    code: 308,
    name: 'Permanent Redirect',
    category: '3xx Redirection',
    description: 'The resource has moved permanently to a different URI; the request method must not change.',
  },

  // 4xx Client Error
  {
    code: 400,
    name: 'Bad Request',
    category: '4xx Client Error',
    description: 'The server could not understand the request due to malformed syntax.',
  },
  {
    code: 401,
    name: 'Unauthorized',
    category: '4xx Client Error',
    description: 'Authentication is required and has failed or has not yet been provided.',
  },
  {
    code: 402,
    name: 'Payment Required',
    category: '4xx Client Error',
    description: 'Reserved for future use, originally intended for digital payment schemes.',
  },
  {
    code: 403,
    name: 'Forbidden',
    category: '4xx Client Error',
    description: 'The server understood the request but refuses to authorize it.',
  },
  {
    code: 404,
    name: 'Not Found',
    category: '4xx Client Error',
    description: 'The server has not found anything matching the requested URI.',
  },
  {
    code: 405,
    name: 'Method Not Allowed',
    category: '4xx Client Error',
    description: 'The method used is not allowed for the resource identified by the request URI.',
  },
  {
    code: 406,
    name: 'Not Acceptable',
    category: '4xx Client Error',
    description: 'No representation of the resource is available matching the Accept headers sent.',
  },
  {
    code: 407,
    name: 'Proxy Authentication Required',
    category: '4xx Client Error',
    description: 'The client must first authenticate itself with the proxy.',
  },
  {
    code: 408,
    name: 'Request Timeout',
    category: '4xx Client Error',
    description: 'The client did not produce a request within the time the server was willing to wait.',
  },
  {
    code: 409,
    name: 'Conflict',
    category: '4xx Client Error',
    description: 'The request conflicts with the current state of the target resource.',
  },
  {
    code: 410,
    name: 'Gone',
    category: '4xx Client Error',
    description: 'The resource is no longer available and no forwarding address is known; this is permanent.',
  },
  {
    code: 411,
    name: 'Length Required',
    category: '4xx Client Error',
    description: 'The server refuses to accept the request without a defined Content-Length header.',
  },
  {
    code: 412,
    name: 'Precondition Failed',
    category: '4xx Client Error',
    description: 'A precondition given in one of the request headers evaluated to false.',
  },
  {
    code: 413,
    name: 'Content Too Large',
    category: '4xx Client Error',
    description: 'The request entity is larger than the server is willing or able to process.',
  },
  {
    code: 414,
    name: 'URI Too Long',
    category: '4xx Client Error',
    description: 'The request URI is longer than the server is willing to interpret.',
  },
  {
    code: 415,
    name: 'Unsupported Media Type',
    category: '4xx Client Error',
    description: "The request entity's media type is not supported by the server or resource.",
  },
  {
    code: 416,
    name: 'Range Not Satisfiable',
    category: '4xx Client Error',
    description: 'None of the ranges in the request Range header overlap the current extent of the resource.',
  },
  {
    code: 417,
    name: 'Expectation Failed',
    category: '4xx Client Error',
    description: 'The expectation given in an Expect request header could not be met by the server.',
  },
  {
    code: 418,
    name: "I'm a Teapot",
    category: '4xx Client Error',
    description:
      "Originally defined by the April Fools' RFC 2324 Hyper Text Coffee Pot Control Protocol. IANA now marks it reserved/unused, but many servers still implement it as an easter egg.",
  },
  {
    code: 421,
    name: 'Misdirected Request',
    category: '4xx Client Error',
    description: 'The request was directed at a server that is not able to produce a response.',
  },
  {
    code: 422,
    name: 'Unprocessable Content',
    category: '4xx Client Error',
    description: 'The request was well-formed but contains semantic errors preventing processing.',
  },
  {
    code: 423,
    name: 'Locked',
    category: '4xx Client Error',
    description: 'The source or destination resource of a method is locked (WebDAV).',
  },
  {
    code: 424,
    name: 'Failed Dependency',
    category: '4xx Client Error',
    description: 'The method could not be performed because a dependent action failed (WebDAV).',
  },
  {
    code: 425,
    name: 'Too Early',
    category: '4xx Client Error',
    description: 'The server is unwilling to risk processing a request that might be replayed.',
  },
  {
    code: 426,
    name: 'Upgrade Required',
    category: '4xx Client Error',
    description: 'The server refuses to perform the request using the current protocol.',
  },
  {
    code: 428,
    name: 'Precondition Required',
    category: '4xx Client Error',
    description: 'The origin server requires the request to be conditional, to avoid lost updates.',
  },
  {
    code: 429,
    name: 'Too Many Requests',
    category: '4xx Client Error',
    description: 'The user has sent too many requests in a given amount of time (rate limiting).',
  },
  {
    code: 431,
    name: 'Request Header Fields Too Large',
    category: '4xx Client Error',
    description: "The server is unwilling to process the request because its header fields are too large.",
  },
  {
    code: 451,
    name: 'Unavailable For Legal Reasons',
    category: '4xx Client Error',
    description: 'The server is denying access to the resource as a consequence of a legal demand.',
  },

  // 5xx Server Error
  {
    code: 500,
    name: 'Internal Server Error',
    category: '5xx Server Error',
    description: 'A generic error occurred on the server and no more specific message is suitable.',
  },
  {
    code: 501,
    name: 'Not Implemented',
    category: '5xx Server Error',
    description: 'The server does not support the functionality required to fulfill the request.',
  },
  {
    code: 502,
    name: 'Bad Gateway',
    category: '5xx Server Error',
    description: 'The server, acting as a gateway or proxy, received an invalid response from upstream.',
  },
  {
    code: 503,
    name: 'Service Unavailable',
    category: '5xx Server Error',
    description: 'The server is temporarily unable to handle the request, often due to overload or maintenance.',
  },
  {
    code: 504,
    name: 'Gateway Timeout',
    category: '5xx Server Error',
    description: 'The server, acting as a gateway or proxy, did not receive a timely response from upstream.',
  },
  {
    code: 505,
    name: 'HTTP Version Not Supported',
    category: '5xx Server Error',
    description: 'The server does not support the HTTP protocol version used in the request.',
  },
  {
    code: 506,
    name: 'Variant Also Negotiates',
    category: '5xx Server Error',
    description: 'The server has an internal configuration error in transparent content negotiation.',
  },
  {
    code: 507,
    name: 'Insufficient Storage',
    category: '5xx Server Error',
    description: 'The server is unable to store the representation needed to complete the request (WebDAV).',
  },
  {
    code: 508,
    name: 'Loop Detected',
    category: '5xx Server Error',
    description: 'The server detected an infinite loop while processing the request (WebDAV).',
  },
  {
    code: 510,
    name: 'Not Extended',
    category: '5xx Server Error',
    description: 'Further extensions to the request are required for the server to fulfill it.',
  },
  {
    code: 511,
    name: 'Network Authentication Required',
    category: '5xx Server Error',
    description: 'The client needs to authenticate to gain network access (e.g. a captive portal).',
  },
];
