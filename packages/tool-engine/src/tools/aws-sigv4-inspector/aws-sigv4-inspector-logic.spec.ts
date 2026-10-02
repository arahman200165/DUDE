import { describe, expect, it } from 'vitest';
import {
  buildCanonicalRequest,
  buildSignedRequest,
  inspectSignedRequest,
} from "./aws-sigv4-inspector-logic.js";

// Reference values below were computed independently (via a standalone
// Node `crypto` script implementing AWS's documented four-task SigV4
// process — canonical request, string to sign, signing key, signature)
// for AWS's well-known worked example: GET https://iam.amazonaws.com/
// ?Action=ListUsers&Version=2010-05-08, dated 2015-08-30T12:36:00Z, with
// AWS's iconic placeholder example credentials (access key AKIDEXAMPLE).
// This cross-validates the canonical-request/string-to-sign/HMAC-chain
// implementation against a from-scratch parallel computation of the same
// spec, rather than only a self-consistency round-trip.
const ACCESS_KEY = 'AKIDEXAMPLE';
const SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const AMZ_DATE = '20150830T123600Z';
const REGION = 'us-east-1';
const SERVICE = 'iam';

const EXPECTED_CANONICAL_REQUEST = [
  'GET',
  '/',
  'Action=ListUsers&Version=2010-05-08',
  'content-type:application/x-www-form-urlencoded; charset=utf-8',
  'host:iam.amazonaws.com',
  'x-amz-date:20150830T123600Z',
  '',
  'content-type;host;x-amz-date',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
].join('\n');

const EXPECTED_STRING_TO_SIGN = [
  'AWS4-HMAC-SHA256',
  '20150830T123600Z',
  '20150830/us-east-1/iam/aws4_request',
  'f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59',
].join('\n');

const EXPECTED_SIGNATURE = '33f5dad2191de0cb4b7ab912f876876c2c4f72e2991a458f9499233c7b992438';

describe('buildSignedRequest', () => {
  it('matches the independently computed canonical request, string-to-sign, and signature', async () => {
    const result = await buildSignedRequest({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      headers: [['content-type', 'application/x-www-form-urlencoded; charset=utf-8']],
      payload: '',
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: REGION,
      service: SERVICE,
      amzDate: AMZ_DATE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonicalRequest).toBe(EXPECTED_CANONICAL_REQUEST);
    expect(result.value.stringToSign).toBe(EXPECTED_STRING_TO_SIGN);
    expect(result.value.signature).toBe(EXPECTED_SIGNATURE);
    expect(result.value.authorizationHeader).toBe(
      `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=${EXPECTED_SIGNATURE}`,
    );
  });

  it('produces the same canonical query string regardless of the input query parameter order', async () => {
    const inOrder = await buildSignedRequest({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      headers: [['content-type', 'application/x-www-form-urlencoded; charset=utf-8']],
      payload: '',
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: REGION,
      service: SERVICE,
      amzDate: AMZ_DATE,
    });
    const reordered = await buildSignedRequest({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Version=2010-05-08&Action=ListUsers',
      headers: [['content-type', 'application/x-www-form-urlencoded; charset=utf-8']],
      payload: '',
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: REGION,
      service: SERVICE,
      amzDate: AMZ_DATE,
    });
    expect(inOrder.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    if (!inOrder.ok || !reordered.ok) return;
    expect(reordered.value.canonicalRequest).toBe(inOrder.value.canonicalRequest);
    expect(reordered.value.signature).toBe(inOrder.value.signature);
  });

  it('collapses internal whitespace runs in header values before signing', async () => {
    const result = await buildSignedRequest({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      headers: [['content-type', 'application/x-www-form-urlencoded;    charset=utf-8']],
      payload: '',
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: REGION,
      service: SERVICE,
      amzDate: AMZ_DATE,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonicalRequest).toBe(EXPECTED_CANONICAL_REQUEST);
  });

  it('double-URI-encodes the path for non-S3 services but not for S3', async () => {
    const nonS3 = await buildSignedRequest({
      method: 'GET',
      url: 'https://example.amazonaws.com/a%20b',
      headers: [],
      payload: '',
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: REGION,
      service: 'execute-api',
      amzDate: AMZ_DATE,
    });
    const s3 = await buildSignedRequest({
      method: 'GET',
      url: 'https://example.s3.amazonaws.com/a%20b',
      headers: [],
      payload: '',
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: REGION,
      service: 's3',
      amzDate: AMZ_DATE,
    });
    expect(nonS3.ok).toBe(true);
    expect(s3.ok).toBe(true);
    if (!nonS3.ok || !s3.ok) return;
    expect(nonS3.value.canonicalRequest).toContain('/a%2520b');
    expect(s3.value.canonicalRequest).toContain('/a%20b');
    expect(s3.value.canonicalRequest).not.toContain('%2520');
  });

  it('rejects a missing secret key', async () => {
    const result = await buildSignedRequest({ method: 'GET', url: 'https://example.com/', headers: [], payload: '', accessKey: 'AK', secretKey: '', region: 'us-east-1', service: 's3' });
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed URL', async () => {
    const result = await buildSignedRequest({ method: 'GET', url: 'not a url', headers: [], payload: '', accessKey: 'AK', secretKey: 'SK', region: 'us-east-1', service: 's3' });
    expect(result.ok).toBe(false);
  });
});

describe('inspectSignedRequest', () => {
  it('round-trips a built request and confirms the signature matches', async () => {
    const built = await buildSignedRequest({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      headers: [['content-type', 'application/x-www-form-urlencoded; charset=utf-8']],
      payload: '',
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: REGION,
      service: SERVICE,
      amzDate: AMZ_DATE,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const inspected = await inspectSignedRequest({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      headers: [
        ['content-type', 'application/x-www-form-urlencoded; charset=utf-8'],
        ['host', 'iam.amazonaws.com'],
        ['x-amz-date', AMZ_DATE],
        ['Authorization', built.value.authorizationHeader],
      ],
      payload: '',
      secretKey: SECRET_KEY,
    });
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(inspected.value.matches).toBe(true);
    expect(inspected.value.expectedSignature).toBe(EXPECTED_SIGNATURE);
  });

  it('reports a mismatch when the request is tampered with after signing', async () => {
    const built = await buildSignedRequest({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      headers: [['content-type', 'application/x-www-form-urlencoded; charset=utf-8']],
      payload: '',
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: REGION,
      service: SERVICE,
      amzDate: AMZ_DATE,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const inspected = await inspectSignedRequest({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08&Extra=tampered',
      headers: [
        ['content-type', 'application/x-www-form-urlencoded; charset=utf-8'],
        ['host', 'iam.amazonaws.com'],
        ['x-amz-date', AMZ_DATE],
        ['Authorization', built.value.authorizationHeader],
      ],
      payload: '',
      secretKey: SECRET_KEY,
    });
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) return;
    expect(inspected.value.matches).toBe(false);
  });

  it('rejects a header set with no Authorization header', async () => {
    const result = await inspectSignedRequest({ method: 'GET', url: 'https://example.com/', headers: [], payload: '', secretKey: 'SK' });
    expect(result.ok).toBe(false);
  });
});

describe('buildCanonicalRequest', () => {
  it('sorts query parameters by key then value', () => {
    const { canonicalRequest } = buildCanonicalRequest({
      method: 'GET',
      path: '/',
      queryParams: [
        ['b', '2'],
        ['a', '2'],
        ['a', '1'],
      ],
      headers: [['host', 'example.com']],
      payloadHash: 'x',
      isS3: false,
    });
    expect(canonicalRequest.split('\n')[2]).toBe('a=1&a=2&b=2');
  });
});
