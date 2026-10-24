import { describe, expect, it } from 'vitest';
import { resolveOAuthOptions } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

/**
 * OAuth state-secret policy: Google sign-in requires an INDEPENDENT random
 * secret. Missing, reused-with-image-signing, or short secrets fail at
 * startup instead of falling back to a weaker key.
 */

const IMAGE_SECRET = 'image-signing-secret-0123456789abcdef';
const STATE_SECRET = 'oauth-state-secret-0123456789abcdef0123456789';

function resolve(overrides: Record<string, string | undefined> = {}) {
  const env = loadEnv({
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: 'https://web.example',
    API_PUBLIC_URL: 'https://api.example',
    IMAGE_URL_SECRET: IMAGE_SECRET,
    GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    OAUTH_STATE_SECRET: STATE_SECRET,
    ...overrides,
  });
  return resolveOAuthOptions(env, ['https://web.example'], true, fetch);
}

describe('Google OAuth state secret', () => {
  it('uses the independent configured secret and builds the default callback', () => {
    const options = resolve();
    expect(options.provider.configured).toBe(true);
    expect(options.stateSecret).toBe(STATE_SECRET);
    expect(options.redirectUri).toBe(
      'https://api.example/v1/auth/oauth/google/callback'
    );
    expect(options.webBaseUrl).toBe('https://web.example');
  });

  it('refuses to start when Google is configured without a state secret', () => {
    expect(() => resolve({ OAUTH_STATE_SECRET: undefined })).toThrow(
      /OAUTH_STATE_SECRET is required/
    );
    expect(() => resolve({ OAUTH_STATE_SECRET: '' })).toThrow(
      /OAUTH_STATE_SECRET is required/
    );
  });

  it('refuses to reuse the image signing secret', () => {
    expect(() => resolve({ OAUTH_STATE_SECRET: IMAGE_SECRET })).toThrow(
      /independent from IMAGE_URL_SECRET/
    );
  });

  it('refuses a short secret', () => {
    expect(() => resolve({ OAUTH_STATE_SECRET: 'short-secret' })).toThrow(
      /at least 32 characters/
    );
  });

  it('does not require a secret when Google is not configured', () => {
    const options = resolve({
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      OAUTH_STATE_SECRET: undefined,
    });
    expect(options.provider.configured).toBe(false);
    expect(options.stateSecret).toBe('');
    expect(() =>
      options.provider.authorizationUrl({
        state: 's',
        nonce: 'n',
        codeChallenge: 'c',
        redirectUri: 'r',
      })
    ).toThrow();
  });
});
