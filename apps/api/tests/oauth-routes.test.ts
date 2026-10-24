import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createMemoryDatabase, type Database } from '../src/db/database.js';
import { MemoryStorage } from '../src/business/storage.js';
import { OAUTH_STATE_COOKIE, signOAuthState, verifyOAuthState } from '../src/business/oauth.js';
import type {
  OAuthAuthorizeInput,
  OAuthExchangeInput,
  OAuthIdentity,
  OAuthProvider,
} from '../src/business/oauth.js';

/**
 * Google OAuth routes with an injected provider: state/PKCE cookie, callback
 * session issuance, no email auto-linking, explicit link flow, and
 * open-redirect handling. The real provider (JWKS verification) has its own
 * unit test; no network is touched here.
 */

const WEB = 'https://web.example';
const SECRET = 'test-oauth-state-secret';
const REDIRECT_URI = 'https://api.example/v1/auth/oauth/google/callback';

class FakeProvider implements OAuthProvider {
  readonly configured = true;
  identity: OAuthIdentity = {
    provider: 'google',
    subject: 'google-subject-1',
    email: 'oauth@example.test',
    emailVerified: true,
    displayName: 'OAuth User',
  };
  lastAuthorize: OAuthAuthorizeInput | null = null;
  lastExchange: OAuthExchangeInput | null = null;
  failExchange = false;

  authorizationUrl(input: OAuthAuthorizeInput): string {
    this.lastAuthorize = input;
    const url = new URL('https://accounts.example.test/auth');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('redirect_uri', input.redirectUri);
    return url.toString();
  }

  async exchangeCode(input: OAuthExchangeInput): Promise<OAuthIdentity> {
    this.lastExchange = input;
    if (this.failExchange) throw new Error('simulated provider outage');
    return this.identity;
  }
}

class DisabledProvider implements OAuthProvider {
  readonly configured = false;
  authorizationUrl(): string {
    throw new Error('not configured');
  }
  async exchangeCode(): Promise<OAuthIdentity> {
    throw new Error('not configured');
  }
}

function cookieList(headers: Record<string, unknown>): string[] {
  const raw = headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

function cookiePair(cookies: string[], name: string): string | null {
  const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return found ? found.split(';')[0] : null;
}

describe('Google OAuth routes', () => {
  let db: Database;
  let provider: FakeProvider;
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    db = await createMemoryDatabase();
    provider = new FakeProvider();
    const built = await buildApp({
      env: { CORS_ALLOWED_ORIGINS: WEB, PAYMENT_MOCK_SECRET: 'test-secret' },
      database: db,
      paymentSecret: 'test-secret',
      storage: new MemoryStorage(),
      oauth: {
        provider,
        redirectUri: REDIRECT_URI,
        webBaseUrl: WEB,
        stateSecret: SECRET,
        secureCookies: false,
      },
    });
    app = built.app;
    cleanup = async () => app.close();
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = null;
    await db.close();
  });

  async function start(
    query = '',
    cookie?: string
  ): Promise<{ state: string; stateCookie: string; location: string }> {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/auth/oauth/google/start${query}`,
      ...(cookie ? { headers: { cookie } } : {}),
    });
    expect(response.statusCode).toBe(302);
    const location = String(response.headers.location);
    const state = new URL(location).searchParams.get('state');
    expect(state).toBeTruthy();
    const cookies = cookieList(response.headers as Record<string, unknown>);
    const stateCookie = cookiePair(cookies, OAUTH_STATE_COOKIE);
    expect(stateCookie).toBeTruthy();
    return { state: state!, stateCookie: stateCookie!, location };
  }

  async function callback(
    state: string,
    stateCookie: string,
    options: { code?: string; cookie?: string; queryState?: string } = {}
  ): Promise<Awaited<ReturnType<typeof app.inject>>> {
    const queryState = options.queryState ?? state;
    return app.inject({
      method: 'GET',
      url: `/v1/auth/oauth/google/callback?code=${encodeURIComponent(
        options.code ?? 'auth-code'
      )}&state=${encodeURIComponent(queryState)}`,
      headers: { cookie: options.cookie ?? stateCookie },
    });
  }

  async function signUpPasswordUser(
    email = 'owner@example.test',
    password = 'password-12345'
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      headers: {
        origin: WEB,
        'x-wallhaze-client': 'web',
        'content-type': 'application/json',
      },
      payload: { email, password },
    });
    expect(response.statusCode).toBe(200);
    const pair = cookiePair(
      cookieList(response.headers as Record<string, unknown>),
      'wh_session'
    );
    expect(pair).toBeTruthy();
    return pair!;
  }

  it('issues a session through the signed state cookie and PKCE', async () => {
    const begun = await start('?returnTo=%2Faccount');
    expect(begun.location.startsWith('https://accounts.example.test/auth?')).toBe(
      true
    );
    const authUrl = new URL(begun.location);
    expect(authUrl.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(authUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(provider.lastAuthorize?.nonce).toBe(
      authUrl.searchParams.get('nonce')
    );

    const returned = await callback(begun.state, begun.stateCookie);
    expect(returned.statusCode).toBe(302);
    expect(returned.headers.location).toBe(`${WEB}/account`);

    // PKCE verifier + nonce reached the provider, never the browser URL.
    expect(provider.lastExchange?.code).toBe('auth-code');
    expect(provider.lastExchange?.codeVerifier).toBeTruthy();
    expect(provider.lastExchange?.nonce).toBe(
      authUrl.searchParams.get('nonce')
    );

    const cookies = cookieList(returned.headers as Record<string, unknown>);
    const sessionPair = cookiePair(cookies, 'wh_session');
    expect(sessionPair).toBeTruthy();
    expect(cookiePair(cookies, OAUTH_STATE_COOKIE)).toBe(
      `${OAUTH_STATE_COOKIE}=`
    );

    const session = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { cookie: sessionPair! },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.email).toBe('oauth@example.test');

    const user = (await db.query('SELECT password_hash FROM users')).rows[0];
    expect(String(user.password_hash).startsWith('oauth$google$')).toBe(true);
    const wallets = (await db.query('SELECT user_id FROM credit_wallets')).rows;
    expect(wallets).toHaveLength(1);
  });

  it('returns to an allowlisted same-site path after sign-in', async () => {
    const begun = await start('?returnTo=%2Fzh%2Fstudio');
    const done = await callback(begun.state, begun.stateCookie);
    expect(done.statusCode).toBe(302);
    expect(done.headers.location).toBe(`${WEB}/zh/studio`);
  });

  it('signs the same Google account into the same user on repeat', async () => {
    const begun1 = await start();
    const done1 = await callback(begun1.state, begun1.stateCookie);
    expect(done1.statusCode).toBe(302);
    const begun2 = await start();
    const done2 = await callback(begun2.state, begun2.stateCookie);
    expect(done2.statusCode).toBe(302);

    expect((await db.query('SELECT id FROM users')).rows).toHaveLength(1);
    expect((await db.query('SELECT id FROM auth_accounts')).rows).toHaveLength(1);

    const session1 = cookiePair(
      cookieList(done1.headers as Record<string, unknown>),
      'wh_session'
    );
    const session2 = cookiePair(
      cookieList(done2.headers as Record<string, unknown>),
      'wh_session'
    );
    const who = async (cookie: string) =>
      (await app.inject({ method: 'GET', url: '/v1/auth/session', headers: { cookie } })).json()
        .user.id;
    expect(await who(session1!)).toBe(await who(session2!));
  });

  it('does not auto-link a Google email to an existing password account', async () => {
    await signUpPasswordUser('taken@example.test');
    provider.identity = {
      ...provider.identity,
      email: 'taken@example.test',
      subject: 'other-subject',
    };
    const begun = await start();
    const returned = await callback(begun.state, begun.stateCookie);
    expect(returned.statusCode).toBe(302);
    expect(returned.headers.location).toBe(
      `${WEB}/login?oauthError=email_exists`
    );
    const cookies = cookieList(returned.headers as Record<string, unknown>);
    expect(cookiePair(cookies, 'wh_session')).toBeNull();
    expect((await db.query('SELECT id FROM users')).rows).toHaveLength(1);
    expect((await db.query('SELECT id FROM auth_accounts')).rows).toHaveLength(0);
  });

  it('does not let another account claim an already-linked Google identity', async () => {
    const ownerSession = await signUpPasswordUser('owner@example.test');
    const ownerLink = await start(
      '?mode=link&returnTo=%2Faccount%2Fsettings',
      ownerSession
    );
    const linked = await callback(ownerLink.state, ownerLink.stateCookie, {
      cookie: `${ownerLink.stateCookie}; ${ownerSession}`,
    });
    expect(linked.headers.location).toBe(`${WEB}/account/settings?oauth=linked`);

    const otherSession = await signUpPasswordUser('other@example.test');
    const otherLink = await start(
      '?mode=link&returnTo=%2Faccount%2Fsettings',
      otherSession
    );
    const refused = await callback(otherLink.state, otherLink.stateCookie, {
      cookie: `${otherLink.stateCookie}; ${otherSession}`,
    });
    expect(refused.statusCode).toBe(302);
    expect(refused.headers.location).toBe(
      `${WEB}/login?oauthError=google_identity_taken`
    );

    // The identity still resolves to the owner, never to the second account.
    const signIn = await start();
    const done = await callback(signIn.state, signIn.stateCookie);
    const session = cookiePair(
      cookieList(done.headers as Record<string, unknown>),
      'wh_session'
    );
    const who = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { cookie: session! },
    });
    expect(who.json().user.email).toBe('owner@example.test');
    expect((await db.query('SELECT id FROM users')).rows).toHaveLength(2);
    expect((await db.query('SELECT id FROM auth_accounts')).rows).toHaveLength(1);
  });

  it('invalidates the OAuth session on logout', async () => {
    const begun = await start();
    const returned = await callback(begun.state, begun.stateCookie);
    const sessionPair = cookiePair(
      cookieList(returned.headers as Record<string, unknown>),
      'wh_session'
    );
    expect(sessionPair).toBeTruthy();

    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: {
        cookie: sessionPair!,
        origin: WEB,
        'x-wallhaze-client': 'web',
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { cookie: sessionPair! },
    });
    expect(after.json()).toBeNull();
  });

  it('redirects an expired state cookie to the readable error page', async () => {
    const begun = await start();
    const raw = begun.stateCookie.slice(begun.stateCookie.indexOf('=') + 1);
    const payload = verifyOAuthState(SECRET, decodeURIComponent(raw));
    expect(payload).toBeTruthy();
    const expired = signOAuthState(SECRET, {
      ...payload!,
      exp: Date.now() - 1,
    });
    provider.lastExchange = null;
    const response = await app.inject({
      method: 'GET',
      url: `/v1/auth/oauth/google/callback?code=expired&state=${encodeURIComponent(
        begun.state
      )}`,
      headers: {
        cookie: `${OAUTH_STATE_COOKIE}=${encodeURIComponent(expired)}`,
      },
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${WEB}/login?oauthError=state`);
    expect(provider.lastExchange).toBeNull();
  });

  it('redirects a provider outage without leaking internals', async () => {
    provider.failExchange = true;
    const begun = await start();
    const response = await callback(begun.state, begun.stateCookie);
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`${WEB}/login?oauthError=failed`);
    expect(
      cookiePair(
        cookieList(response.headers as Record<string, unknown>),
        'wh_session'
      )
    ).toBeNull();
  });

  it('rejects a linked account that was suspended', async () => {
    const begun = await start();
    const done = await callback(begun.state, begun.stateCookie);
    expect(done.headers.location).toBe(`${WEB}/account`);
    await db.query("UPDATE users SET status='suspended'");

    const second = await start();
    const refused = await callback(second.state, second.stateCookie);
    expect(refused.statusCode).toBe(302);
    expect(refused.headers.location).toBe(
      `${WEB}/login?oauthError=suspended`
    );
  });

  it('rejects a mismatched or missing state and honours the allowlist', async () => {
    const begun = await start('?returnTo=https%3A%2F%2Fevil.example%2Fx');
    const mismatch = await callback(begun.state, begun.stateCookie, {
      queryState: 'different-state',
    });
    expect(mismatch.headers.location).toBe(`${WEB}/login?oauthError=state`);
    expect(cookiePair(cookieList(mismatch.headers as Record<string, unknown>), 'wh_session')).toBeNull();

    const noCookie = await callback(begun.state, '');
    expect(noCookie.headers.location).toBe(`${WEB}/login?oauthError=state`);

    // The rejected absolute returnTo falls back to the web origin's /account.
    const accepted = await callback(begun.state, begun.stateCookie);
    expect(accepted.headers.location).toBe(`${WEB}/account`);
  });

  it('links Google only through an authenticated, explicit link flow', async () => {
    const sessionPair = await signUpPasswordUser('owner@example.test');

    // Without a session the link flow refuses to start.
    const anonymous = await app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/google/start?mode=link',
    });
    expect(anonymous.statusCode).toBe(401);

    const begun = await start(
      '?mode=link&returnTo=%2Faccount%2Fsettings',
      sessionPair
    );
    const linked = await callback(begun.state, begun.stateCookie, {
      cookie: `${begun.stateCookie}; ${sessionPair}`,
    });
    expect(linked.statusCode).toBe(302);
    expect(linked.headers.location).toBe(`${WEB}/account/settings?oauth=linked`);

    const links = await app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/links',
      headers: { cookie: sessionPair },
    });
    expect(links.json()).toEqual({ google: true });

    // The linked identity now signs in directly.
    const signIn = await start();
    const done = await callback(signIn.state, signIn.stateCookie);
    expect(done.statusCode).toBe(302);
    const oauthSession = cookiePair(
      cookieList(done.headers as Record<string, unknown>),
      'wh_session'
    );
    const user = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { cookie: oauthSession! },
    });
    expect(user.json().user.email).toBe('owner@example.test');
    expect((await db.query('SELECT id FROM users')).rows).toHaveLength(1);
  });

  it('reports an unconfigured provider instead of faking a login', async () => {
    await app.close();
    cleanup = null;
    const disabled = await buildApp({
      env: { CORS_ALLOWED_ORIGINS: WEB },
      database: db,
      storage: new MemoryStorage(),
      oauth: {
        provider: new DisabledProvider(),
        redirectUri: REDIRECT_URI,
        webBaseUrl: WEB,
        stateSecret: SECRET,
        secureCookies: false,
      },
    });
    app = disabled.app;
    cleanup = async () => app.close();

    const status = await app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/google/status',
    });
    expect(status.json()).toEqual({ google: false });

    const refused = await app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/google/start',
    });
    expect(refused.statusCode).toBe(503);
  });
});
