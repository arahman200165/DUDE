import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { ErrorEnvelope, HubErrorCode } from '@dude/contracts/hub';

export function envelope(code: HubErrorCode, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

/** Maps every error to a fixed, non-leaking envelope. Messages never include stacks or internal detail. */
export function hubErrorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || error.statusCode === 413) {
    void reply.code(413).type('application/json').send(envelope('payload-too-large', 'The request body is too large.'));
    return;
  }
  if (error.validation || (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500)) {
    void reply.code(400).type('application/json').send(envelope('bad-request', 'The request is not valid.'));
    return;
  }
  request.log.error({ errCode: error.code }, 'unhandled error');
  void reply.code(500).type('application/json').send(envelope('internal', 'Internal error.'));
}
