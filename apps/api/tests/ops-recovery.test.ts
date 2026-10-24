import { afterEach, beforeEach, expect, it } from 'vitest';
import { createMemoryDatabase, type Database } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';
import {
  AuthService,
  createCredentialUser,
  resetUserPassword,
} from '../src/business/auth.js';

/**
 * Ops recovery tooling: account creation without a session, and a password
 * reset that revokes sessions and clears the login throttle.
 */
let db: Database;
beforeEach(async () => {
  db = await createMemoryDatabase();
  await migrate(db);
});
afterEach(async () => {
  await db?.close();
});

it('creates an account and wallet without issuing a session', async () => {
  const created = await createCredentialUser(
    db,
    'Ops@example.test',
    'generated-password-1'
  );
  expect(created).toMatchObject({ email: 'ops@example.test', created: true });
  expect((await db.query('SELECT token_hash FROM auth_sessions')).rows).toHaveLength(0);
  expect(
    (await db.query('SELECT balance,reserved FROM credit_wallets')).rows[0]
  ).toMatchObject({ balance: 0, reserved: 0 });

  // Re-running never resets an existing account's password.
  const again = await createCredentialUser(
    db,
    'ops@example.test',
    'different-password-2'
  );
  expect(again).toMatchObject({ id: created.id, created: false });
});

it('resets a password, revokes sessions and clears throttling', async () => {
  await createCredentialUser(db, 'ops@example.test', 'generated-password-1');
  const auth = new AuthService(db);
  const first = await auth.signIn('ops@example.test', 'generated-password-1', '1');

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await auth.signIn('ops@example.test', 'wrong-password', '1').catch(() => undefined);
  }
  await expect(
    auth.signIn('ops@example.test', 'generated-password-1', '1')
  ).rejects.toMatchObject({ code: 'RATE_LIMITED' });

  expect(
    await resetUserPassword(db, 'ops@example.test', 'replacement-password-3')
  ).toBe(true);
  expect(await auth.session(first.token)).toBeNull();
  const second = await auth.signIn(
    'ops@example.test',
    'replacement-password-3',
    '1'
  );
  expect(second.token).toBeTruthy();
  await expect(
    auth.signIn('ops@example.test', 'generated-password-1', '1')
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('reports an unknown account instead of creating one on reset', async () => {
  expect(
    await resetUserPassword(db, 'missing@example.test', 'replacement-password-3')
  ).toBe(false);
  await expect(
    createCredentialUser(db, 'not-an-email', 'replacement-password-3')
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
