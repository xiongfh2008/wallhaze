import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Database } from "../db/database.js";
import type { OAuthIdentity } from "./oauth.js";
import { AppError } from "../errors/app-error.js";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

/**
 * Credential + session service (R03).
 *
 * Design (docs/codex/DECISIONS.md):
 * - passwords hashed with Node crypto scrypt (per-user random salt,
 *   timing-safe verification) — never stored or logged in any other form;
 * - sessions are opaque random tokens; ONLY the sha256 hash reaches the
 *   database, so a leaked database cannot be replayed against users;
 * - failed sign-ins are throttled per (email, ip) in auth_attempts — a
 *   persistent, transaction-backed counter (survives restarts);
 * - suspended users (e.g. refund debt) cannot sign in and their existing
 *   sessions stop resolving;
 * - no OAuth/email auto-linking: providers may only bind to an explicitly
 *   authenticated account (auth_accounts rows), never merged by email.
 */

const SESSION_TTL_DAYS = 30;
const ATTEMPT_WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 10;
const SCRYPT_KEY_LENGTH = 64;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface AuthSessionInfo {
  user: AuthUser;
  /** ISO 8601 expiry of the session. */
  expiresAt: string;
}

export interface AuthResult {
  /** Opaque bearer of the session — sent to clients as an HttpOnly cookie. */
  token: string;
  session: AuthSessionInfo;
}

interface UserRow {
  [key: string]: unknown;
  id: string;
  email: string;
  display_name: string | null;
  password_hash: string;
  status: string;
}

interface SessionRow {
  [key: string]: unknown;
  token_hash: string;
  user_id: string;
  expires_at: Date | string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateCredentials(rawEmail: unknown, rawPassword: unknown): {
  email: string;
  password: string;
} {
  if (typeof rawEmail !== "string" || !EMAIL_PATTERN.test(rawEmail.trim())) {
    throw new AppError("VALIDATION_ERROR", "A valid email address is required");
  }
  if (
    typeof rawPassword !== "string" ||
    rawPassword.length < PASSWORD_MIN_LENGTH
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
    );
  }
  return { email: normalizeEmail(rawEmail), password: rawPassword };
}

async function issueSession(
  db: Database,
  userId: string
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    "INSERT INTO auth_sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)",
    [hashToken(token), userId, randomBytes(16).toString("hex"), expiresAt]
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

async function findUser(db: Database, email: string): Promise<UserRow | undefined> {
  return (
    await db.query<UserRow>("SELECT * FROM users WHERE email=$1", [email])
  ).rows[0];
}

function assertActive(user: UserRow): void {
  if (user.status !== "active") {
    throw new AppError("UNAUTHENTICATED", "Invalid email or password");
  }
}

/** A provider identity is only usable when the provider verified its email. */
function assertOAuthIdentity(identity: OAuthIdentity): void {
  if (
    identity.provider !== "google" ||
    typeof identity.subject !== "string" ||
    identity.subject.length === 0 ||
    typeof identity.email !== "string" ||
    !EMAIL_PATTERN.test(identity.email) ||
    identity.emailVerified !== true
  ) {
    throw new AppError("UNAUTHENTICATED", "OAuth identity is not verified");
  }
}

/** Failed sign-in counter (per email+ip bucket, sliding window in DB). */
async function recordFailure(db: Database, bucket: string): Promise<void> {
  await db.query(
    `INSERT INTO auth_attempts(bucket,count,window_start) VALUES($1,1,now())
     ON CONFLICT (bucket) DO UPDATE SET
       count = CASE WHEN auth_attempts.window_start < now() - ($2::text)::interval
                    THEN 1 ELSE auth_attempts.count + 1 END,
       window_start = CASE WHEN auth_attempts.window_start < now() - ($2::text)::interval
                    THEN now() ELSE auth_attempts.window_start END`,
    [bucket, `${ATTEMPT_WINDOW_MINUTES} minutes`]
  );
}

async function assertNotThrottled(db: Database, bucket: string): Promise<void> {
  const row = (
    await db.query<{ count: number | string; window_start: Date | string }>(
      "SELECT count,window_start FROM auth_attempts WHERE bucket=$1 AND window_start > now() - ($2::text)::interval",
      [bucket, `${ATTEMPT_WINDOW_MINUTES} minutes`]
    )
  ).rows[0];
  if (row && Number(row.count) >= MAX_ATTEMPTS) {
    const windowEnd =
      row.window_start instanceof Date
        ? row.window_start.getTime()
        : new Date(row.window_start).getTime();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (windowEnd + ATTEMPT_WINDOW_MINUTES * 60 * 1000 - Date.now()) / 1000
      )
    );
    throw new AppError("RATE_LIMITED", "Too many attempts — try again later", {
      retryAfterSeconds,
    });
  }
}

/** Operator unlock: clears failed-attempt counters for one email (all IPs). */
export async function clearAuthThrottle(db: Database, email: string): Promise<number> {
  const rows = (
    await db.query<{ bucket: string }>(
      "DELETE FROM auth_attempts WHERE bucket LIKE $1 RETURNING bucket",
      [email + "|%"]
    )
  ).rows;
  return rows.length;
}

/**
 * Ops recovery tooling (npm run ops): creates an account and its empty
 * wallet WITHOUT issuing a session. An existing email is reported, never
 * modified — password changes must go through resetUserPassword.
 */
export async function createCredentialUser(
  db: Database,
  rawEmail: string,
  rawPassword: string
): Promise<{ id: string; email: string; created: boolean }> {
  const { email, password } = validateCredentials(rawEmail, rawPassword);
  const existing = await findUser(db, email);
  if (existing) return { id: existing.id, email, created: false };
  const userId = randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)",
        [userId, email, passwordHash, null]
      );
      await tx.query(
        "INSERT INTO credit_wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",
        [userId]
      );
    });
  } catch (error) {
    // A concurrent writer created the account first — report it as existing.
    if ((error as { code?: string }).code === "23505") {
      const row = await findUser(db, email);
      if (row) return { id: row.id, email, created: false };
    }
    throw error;
  }
  return { id: userId, email, created: true };
}

/**
 * Ops recovery tooling: replaces a password, revokes every session and
 * clears the failed-attempt counters (a locked-out operator must not stay
 * locked out after a deliberate reset). Returns false for unknown emails.
 */
export async function resetUserPassword(
  db: Database,
  rawEmail: string,
  rawPassword: string
): Promise<boolean> {
  const { email, password } = validateCredentials(rawEmail, rawPassword);
  const user = await findUser(db, email);
  if (!user) return false;
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
      passwordHash,
      user.id,
    ]);
    await tx.query("DELETE FROM auth_sessions WHERE user_id=$1", [user.id]);
    await tx.query("DELETE FROM auth_attempts WHERE bucket LIKE $1", [
      email + "|%",
    ]);
  });
  return true;
}

export class AuthService {
  constructor(private db: Database) {}

  /** Registers a user with an empty wallet and an immediately active session. */
  async signUp(
    rawEmail: string,
    rawPassword: string,
    _ip: string
  ): Promise<AuthResult> {
    const { email, password } = validateCredentials(rawEmail, rawPassword);
    const existing = await findUser(this.db, email);
    if (existing) {
      throw new AppError("CONFLICT", "An account with this email already exists");
    }
    const userId = randomUUID();
    const passwordHash = await hashPassword(password);
    try {
      await this.db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)",
          [userId, email, passwordHash, null]
        );
        await tx.query(
          "INSERT INTO credit_wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",
          [userId]
        );
      });
    } catch (error) {
      // Unique violation (23505) — a concurrent sign-up won the race.
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "23505"
      ) {
        throw new AppError(
          "CONFLICT",
          "An account with this email already exists"
        );
      }
      throw error;
    }
    const issued = await issueSession(this.db, userId);
    return {
      token: issued.token,
      session: {
        user: { id: userId, email, displayName: null },
        expiresAt: issued.expiresAt,
      },
    };
  }

  /** Verifies credentials under per-bucket throttling and issues a session. */
  async signIn(
    rawEmail: string,
    rawPassword: string,
    ip: string
  ): Promise<AuthResult> {
    const { email, password } = validateCredentials(rawEmail, rawPassword);
    const bucket = `${email}|${ip}`;
    await assertNotThrottled(this.db, bucket);
    const user = await findUser(this.db, email);
    if (
      !user ||
      !(await verifyPassword(password, user.password_hash)) ||
      user.status === "deletion_requested"
    ) {
      await recordFailure(this.db, bucket);
      throw new AppError("UNAUTHENTICATED", "Invalid email or password");
    }
    assertActive(user);
    await this.db.query("DELETE FROM auth_attempts WHERE bucket=$1", [bucket]);
    const issued = await issueSession(this.db, user.id);
    return {
      token: issued.token,
      session: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
        },
        expiresAt: issued.expiresAt,
      },
    };
  }

  /**
   * OAuth sign-in. An existing auth_accounts binding always wins. An
   * unlinked identity may create a NEW account, but never takes over an
   * existing email account — that requires the explicit link flow from an
   * authenticated session.
   */
  async signInWithOAuth(identity: OAuthIdentity): Promise<AuthResult> {
    assertOAuthIdentity(identity);
    const linked = await this.findOAuthLink(identity);
    if (linked) return this.sessionForUser(linked);
    const existing = await findUser(this.db, identity.email);
    if (existing) {
      throw new AppError(
        "CONFLICT",
        "An account with this email already exists — sign in with your password and connect Google from account settings.",
        { details: { reason: "email_exists" } }
      );
    }
    const userId = randomUUID();
    // OAuth-only accounts have no usable password. This sentinel scheme is
    // rejected by verifyPassword(), so password sign-in can never succeed.
    const passwordHash = `oauth$${identity.provider}$${randomBytes(24).toString("hex")}`;
    try {
      await this.db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)",
          [userId, identity.email, passwordHash, identity.displayName]
        );
        await tx.query(
          "INSERT INTO credit_wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",
          [userId]
        );
        await tx.query(
          "INSERT INTO auth_accounts(id,user_id,provider,provider_account_id) VALUES($1,$2,$3,$4)",
          [randomUUID(), userId, identity.provider, identity.subject]
        );
      });
    } catch (error) {
      // Concurrent callbacks for the same identity: the winner inserted the
      // link, so sign in as that user rather than failing the login.
      if ((error as { code?: string }).code === "23505") {
        const raced = await this.findOAuthLink(identity);
        if (raced) return this.sessionForUser(raced);
        const user = await findUser(this.db, identity.email);
        if (user) {
          throw new AppError(
            "CONFLICT",
            "An account with this email already exists — sign in with your password and connect Google from account settings.",
            { details: { reason: "email_exists" } }
          );
        }
      }
      throw error;
    }
    return this.sessionForUser(userId);
  }

  /** Explicit link flow (settings): binds a provider identity to ONE user. */
  async linkOAuthIdentity(
    userId: string,
    identity: OAuthIdentity
  ): Promise<void> {
    assertOAuthIdentity(identity);
    const linked = await this.findOAuthLink(identity);
    if (linked) {
      if (linked === userId) return; // idempotent re-link
      throw new AppError(
        "CONFLICT",
        "This Google account is already linked to another WallHaze account.",
        { details: { reason: "google_identity_taken" } }
      );
    }
    const own = (
      await this.db.query<{ id: string }>(
        "SELECT id FROM auth_accounts WHERE user_id=$1 AND provider=$2",
        [userId, identity.provider]
      )
    ).rows[0];
    if (own) {
      throw new AppError(
        "CONFLICT",
        "A Google account is already linked to this WallHaze account.",
        { details: { reason: "google_already_linked" } }
      );
    }
    try {
      await this.db.query(
        "INSERT INTO auth_accounts(id,user_id,provider,provider_account_id) VALUES($1,$2,$3,$4)",
        [randomUUID(), userId, identity.provider, identity.subject]
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AppError(
          "CONFLICT",
          "This Google account is already linked to another WallHaze account.",
          { details: { reason: "google_identity_taken" } }
        );
      }
      throw error;
    }
  }

  /** Provider names linked to this account (for the settings panel). */
  async oauthProviders(userId: string): Promise<string[]> {
    const rows = (
      await this.db.query<{ provider: string }>(
        "SELECT provider FROM auth_accounts WHERE user_id=$1 ORDER BY provider",
        [userId]
      )
    ).rows;
    return rows.map((row) => row.provider);
  }

  private async findOAuthLink(
    identity: OAuthIdentity
  ): Promise<string | null> {
    const row = (
      await this.db.query<{ user_id: string }>(
        "SELECT user_id FROM auth_accounts WHERE provider=$1 AND provider_account_id=$2",
        [identity.provider, identity.subject]
      )
    ).rows[0];
    return row?.user_id ?? null;
  }

  private async sessionForUser(userId: string): Promise<AuthResult> {
    const row = (
      await this.db.query<UserRow>("SELECT * FROM users WHERE id=$1", [userId])
    ).rows[0];
    if (!row || row.status !== "active") {
      throw new AppError("UNAUTHENTICATED", "This account cannot sign in", {
        details: { reason: "suspended" },
      });
    }
    const issued = await issueSession(this.db, userId);
    return {
      token: issued.token,
      session: {
        user: {
          id: row.id,
          email: row.email,
          displayName: row.display_name,
        },
        expiresAt: issued.expiresAt,
      },
    };
  }

  /** Resolves an opaque session token; null when unknown/expired/suspended. */
  async session(token: string): Promise<AuthSessionInfo | null> {    if (typeof token !== "string" || token.length === 0) return null;
    const row = (
      await this.db.query<SessionRow & UserRow>(
        `SELECT s.token_hash,s.user_id,s.expires_at,u.id,u.email,u.display_name,u.status
         FROM auth_sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.expires_at>now()`,
        [hashToken(token)]
      )
    ).rows[0];
    if (!row || row.status !== "active") return null;
    return {
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
      },
      expiresAt:
        row.expires_at instanceof Date
          ? row.expires_at.toISOString()
          : new Date(row.expires_at).toISOString(),
    };
  }

  /** Revokes one session (idempotent — unknown tokens succeed). */
  async signOut(token: string): Promise<void> {
    if (typeof token !== "string" || token.length === 0) return;
    await this.db.query("DELETE FROM auth_sessions WHERE token_hash=$1", [
      hashToken(token),
    ]);
  }
}
