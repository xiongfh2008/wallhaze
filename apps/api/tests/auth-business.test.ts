import { beforeEach, afterEach, expect, it } from 'vitest';
import { createMemoryDatabase, type Database } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';
import { AuthService } from '../src/business/auth.js';
let db: Database;
let auth: AuthService;
beforeEach(async () => { db = await createMemoryDatabase(); await migrate(db); auth = new AuthService(db); });
afterEach(async () => { await db?.close(); });
it('creates an empty wallet, hashes passwords and stores only hashed sessions', async () => {
  const result = await auth.signUp('Alice@example.test', 'safe-example-password-123', '127.0.0.1');
  expect(result.session.user.email).toBe('alice@example.test');
  const user = (await db.query('SELECT password_hash FROM users')).rows[0];
  expect(user.password_hash).not.toContain('safe-example-password');
  const wallet = (await db.query('SELECT balance,reserved FROM credit_wallets')).rows[0];
  expect(wallet).toMatchObject({ balance: 0, reserved: 0 });
  expect((await db.query('SELECT token_hash FROM auth_sessions')).rows[0].token_hash).not.toBe(result.token);
  expect((await auth.session(result.token))?.user.id).toBe(result.session.user.id);
  await auth.signOut(result.token);
  expect(await auth.session(result.token)).toBeNull();
});
it('rejects bad credentials, expired sessions, suspended users, and duplicate email', async () => {
  const first = await auth.signUp('a@example.test', 'long-enough-password', '1');
  await expect(auth.signUp('A@example.test','long-enough-password','1')).rejects.toMatchObject({code:'CONFLICT'});
  await expect(auth.signIn('a@example.test','wrong-password','1')).rejects.toMatchObject({code:'UNAUTHENTICATED'});
  await db.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second'");
  expect(await auth.session(first.token)).toBeNull();
  await db.query("UPDATE users SET status='suspended'");
  await expect(auth.signIn('a@example.test','long-enough-password','1')).rejects.toMatchObject({code:'UNAUTHENTICATED'});
});
it('validates input and persists attempt throttling', async () => {
  await expect(auth.signUp('bad','short','1')).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  for(let i=0;i<10;i++) await auth.signIn('missing@example.test','a-long-password','attacker').catch(()=>undefined);
  await expect(auth.signIn('missing@example.test','a-long-password','attacker')).rejects.toMatchObject({code:'RATE_LIMITED'});
});
