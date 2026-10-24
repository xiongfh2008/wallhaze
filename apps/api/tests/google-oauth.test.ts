import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  GoogleOAuthProvider,
  pkceChallenge,
  signOAuthState,
  verifyOAuthState,
} from '../src/business/oauth.js';

/**
 * Real Google provider logic without network: a locally generated RSA key
 * signs the ID token and serves as the JWKS. This covers signature
 * verification plus issuer/audience/expiry/nonce/email_verified checks.
 */

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const NONCE = 'nonce-value';
const KID = 'test-kid';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: KID,
  alg: 'RS256',
  use: 'sig',
};

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function makeIdToken(overrides: Record<string, unknown> = {}): string {
  const header = base64url({ alg: 'RS256', kid: KID, typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-subject-1',
    email: 'User@Example.test',
    email_verified: true,
    name: 'Test User',
    nonce: NONCE,
    iat: now,
    exp: now + 300,
    ...overrides,
  });
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`, 'utf8'),
    privateKey
  ).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function providerFor(idToken: string, jwksKeys: unknown[] = [publicJwk]) {
  let tokenBody = '';
  const fetchImpl = (async (
    input: unknown,
    init?: { body?: unknown }
  ): Promise<Response> => {
    const url = String(input);
    if (url === 'https://token.test/token') {
      tokenBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ id_token: idToken }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://jwks.test/certs') {
      return new Response(JSON.stringify({ keys: jwksKeys }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  const provider = new GoogleOAuthProvider({
    clientId: CLIENT_ID,
    clientSecret: 'client-secret',
    fetchImpl,
    authorizationEndpoint: 'https://auth.test/auth',
    tokenEndpoint: 'https://token.test/token',
    jwksUri: 'https://jwks.test/certs',
  });
  return { provider, tokenBody: () => tokenBody };
}

const exchange = (provider: GoogleOAuthProvider, nonce = NONCE) =>
  provider.exchangeCode({
    code: 'authorization-code',
    codeVerifier: 'verifier',
    redirectUri: 'https://api.example/callback',
    nonce,
  });

describe('GoogleOAuthProvider', () => {
  it('builds an authorization URL with PKCE, state and nonce', () => {
    const { provider } = providerFor(makeIdToken());
    const url = new URL(
      provider.authorizationUrl({
        state: 'state-1',
        nonce: 'nonce-1',
        codeChallenge: 'challenge-1',
        redirectUri: 'https://api.example/callback',
      })
    );
    expect(url.origin + url.pathname).toBe('https://auth.test/auth');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('nonce')).toBe('nonce-1');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.example/callback'
    );
  });

  it('verifies the ID token and returns a normalized identity', async () => {
    const { provider, tokenBody } = providerFor(makeIdToken());
    const identity = await exchange(provider);
    expect(identity).toEqual({
      provider: 'google',
      subject: 'google-subject-1',
      email: 'user@example.test',
      emailVerified: true,
      displayName: 'Test User',
    });
    // The client secret and PKCE verifier are posted server-side only.
    expect(tokenBody()).toContain('client_secret=client-secret');
    expect(tokenBody()).toContain('code_verifier=verifier');
  });

  it('rejects claims that do not match this flow', async () => {
    const { provider } = providerFor(makeIdToken());
    await expect(exchange(provider, 'other-nonce')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
    });

    for (const overrides of [
      { aud: 'another-client' },
      { iss: 'https://evil.example' },
      { exp: Math.floor(Date.now() / 1000) - 3600 },
      { email_verified: false },
      { sub: undefined },
      { email: undefined },
    ]) {
      const broken = providerFor(makeIdToken(overrides)).provider;
      await expect(exchange(broken)).rejects.toMatchObject({
        code: 'UPSTREAM_ERROR',
      });
    }
  });

  it('rejects a tampered signature and an unknown signing key', async () => {
    const token = makeIdToken();
    const [header, payload] = token.split('.');
    const tampered = `${header}.${payload}.${Buffer.from('forged').toString('base64url')}`;
    await expect(
      exchange(providerFor(tampered).provider)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });

    await expect(
      exchange(providerFor(makeIdToken(), []).provider)
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});

describe('OAuth state and PKCE helpers', () => {
  const payload = {
    state: 'state',
    verifier: 'verifier',
    nonce: 'nonce',
    returnTo: '/account',
    mode: 'signin' as const,
    exp: Date.now() + 60_000,
  };

  it('round-trips a signed payload', () => {
    const token = signOAuthState('secret', payload);
    expect(verifyOAuthState('secret', token)).toEqual(payload);
  });

  it('rejects tampering and a different secret', () => {
    const token = signOAuthState('secret', payload);
    const [body, mac] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...payload, returnTo: '/evil' })
    ).toString('base64url');
    expect(verifyOAuthState('secret', `${forged}.${mac}`)).toBeNull();
    expect(verifyOAuthState('other-secret', token)).toBeNull();
    expect(verifyOAuthState('secret', `${body}.${mac.slice(0, -2)}aa`)).toBeNull();
  });

  it('derives the S256 PKCE challenge', () => {
    expect(pkceChallenge('verifier')).toBe(
      'iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ'
    );
  });
});
