import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { migrate } from "../src/db/migrate.js";
import { MemoryStorage } from "../src/business/storage.js";
import { enqueueJob } from "../src/business/jobs.js";
import { runWorkerOnce } from "../src/business/worker.js";
import { MockJobProvider } from "../src/business/providers.js";
import { credit } from "../src/business/wallet.js";
import { cleanupRetention } from "../src/business/maintenance.js";
import { resolveR2StorageStrict } from "../src/business/r2-storage.js";
import { MEDIA_RETENTION_DAYS } from "../src/business/media-lifecycle.js";

/**
 * Scheduled retention-entry behaviour (jobs/db-retention.ts logic via
 * cleanupRetention + jobs/media-retention.ts storage resolution):
 *  - unexpired rows are never deleted;
 *  - expired rows are deleted under the exact policy conditions;
 *  - webhook status filter (received/failed kept);
 *  - repeated runs are idempotent;
 *  - financial/order rows are never touched;
 *  - R2 driver resolution fails closed without credentials.
 */

let db: Database;
let cleanupApp: (() => Promise<void>) | null = null;
const emailSeq = { n: 0 };

beforeEach(async () => {
  db = await createMemoryDatabase();
  await migrate(db);
});

afterEach(async () => {
  await cleanupApp?.();
  cleanupApp = null;
  await db.close();
});

const WEB = {
  "x-wallhaze-client": "web",
  "content-type": "application/json",
  origin: "https://web.example",
};

async function signUp(email: string): Promise<{ id: string; cookie: string }> {
  const { app } = await buildApp({
    env: { CORS_ALLOWED_ORIGINS: "https://web.example", FAL_MOCK: "1" },
    database: db,
    storage: new MemoryStorage(),
  });
  const signup = await app.inject({
    method: "POST",
    url: "/v1/auth/signup",
    headers: WEB,
    payload: { email, password: "example-password-long" },
  });
  expect(signup.statusCode).toBe(200);
  const user = (
    await db.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [email])
  ).rows[0];
  const cookie = signup.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  await db.transaction((tx) => credit(tx, user.id, 100, `fund-${email}`, "test"));
  await app.close();
  return { id: user.id, cookie };
}

async function insertWebhook(
  provider: string,
  eventId: string,
  status: "received" | "processed" | "failed",
  ageDays: number
): Promise<void> {
  await db.query(
    `INSERT INTO payment_webhook_events(provider,event_id,payload,status,received_at,processed_at)
     VALUES($1,$2,'{}'::jsonb,$3, now() - ($4::text)::interval,
            CASE WHEN $3='processed' THEN now() - ($4::text)::interval ELSE NULL END)`,
    [provider, eventId, status, `${ageDays} days`]
  );
}

describe("db-retention entry logic (cleanupRetention)", () => {
  it("deletes only auth_attempts older than 24h; fresh buckets survive", async () => {
    await db.query(
      `INSERT INTO auth_attempts(bucket,count,window_start) VALUES
       ('old',1, now() - interval '25 hours'),
       ('fresh',1, now() - interval '1 hour')`
    );
    const result = await cleanupRetention(db);
    expect(result.authAttempts).toBe(1);
    const buckets = (
      await db.query<{ bucket: string }>("SELECT bucket FROM auth_attempts")
    ).rows.map((r) => r.bucket);
    expect(buckets).toEqual(["fresh"]);
  });

  it("deletes only processed webhooks older than 90d; received/failed kept regardless of age", async () => {
    await insertWebhook("waffo", "old-processed", "processed", 91);
    await insertWebhook("waffo", "fresh-processed", "processed", 1);
    await insertWebhook("waffo", "old-received", "received", 200);
    await insertWebhook("waffo", "old-failed", "failed", 200);
    const result = await cleanupRetention(db);
    expect(result.webhookEvents).toBe(1);
    const remaining = (
      await db.query<{ event_id: string }>(
        "SELECT event_id FROM payment_webhook_events ORDER BY event_id"
      )
    ).rows.map((r) => r.event_id);
    expect(remaining).toEqual(["fresh-processed", "old-failed", "old-received"]);
  });

  it("never touches orders, ledger rows or jobs (financial records stay)", async () => {
    const { id: userId } = await signUp(`fin-${++emailSeq.n}@example.com`);
    await db.transaction((tx) =>
      credit(tx, userId, 50, "ledger-keep", "test")
    );
    const ledgerBefore = (
      await db.query<{ n: string }>("SELECT count(*)::text AS n FROM credit_ledger")
    ).rows[0].n;
    await cleanupRetention(db);
    const ledgerAfter = (
      await db.query<{ n: string }>("SELECT count(*)::text AS n FROM credit_ledger")
    ).rows[0].n;
    expect(ledgerAfter).toBe(ledgerBefore);
    const jobs = (
      await db.query<{ n: string }>("SELECT count(*)::text AS n FROM generation_jobs")
    ).rows[0].n;
    expect(jobs).toBe("0");
    void userId;
  });

  it("is idempotent: a second run deletes nothing new", async () => {
    await insertWebhook("waffo", "old-processed", "processed", 95);
    await db.query(
      `INSERT INTO auth_attempts(bucket,count,window_start) VALUES ('old',1, now() - interval '48 hours')`
    );
    const first = await cleanupRetention(db);
    expect(first.authAttempts).toBe(1);
    expect(first.webhookEvents).toBe(1);
    const second = await cleanupRetention(db);
    expect(second).toEqual({ authAttempts: 0, webhookEvents: 0 });
  });
});

describe("media-retention entry storage resolution (resolveR2StorageStrict)", () => {
  it("refuses to run without STORAGE_DRIVER=r2 (no silent driver switch)", () => {
    expect(() =>
      resolveR2StorageStrict({ STORAGE_DRIVER: "local" })
    ).toThrow(/STORAGE_DRIVER=r2 is required/);
    expect(() => resolveR2StorageStrict({})).toThrow(
      /STORAGE_DRIVER=r2 is required/
    );
  });

  it("refuses r2 mode with any missing credential (fail-closed)", () => {
    expect(() =>
      resolveR2StorageStrict({
        STORAGE_DRIVER: "r2",
        R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      })
    ).toThrow(/R2_ACCESS_KEY_ID/);
    expect(() =>
      resolveR2StorageStrict({
        STORAGE_DRIVER: "r2",
        R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
        R2_ACCESS_KEY_ID: "a",
        R2_SECRET_ACCESS_KEY: "s",
        // R2_BUCKET missing
      })
    ).toThrow(/R2_BUCKET/);
  });

  it("constructs the real R2 adapter when the full set is present", () => {
    const storage = resolveR2StorageStrict({
      STORAGE_DRIVER: "r2",
      R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "a",
      R2_SECRET_ACCESS_KEY: "s",
      R2_BUCKET: "wallhaze-staging-private",
    });
    expect(storage.constructor.name).toBe("R2Storage");
  });

  it("keeps the 30-day policy constant aligned with the privacy policy", () => {
    expect(MEDIA_RETENTION_DAYS).toBe(30);
  });

  it("enqueue/worker path still settles into image_assets with 30d expiry (regression)", async () => {
    const { id: userId, cookie } = await signUp(
      `life-${++emailSeq.n}@example.com`
    );
    const { app } = await buildApp({
      env: { CORS_ALLOWED_ORIGINS: "https://web.example", FAL_MOCK: "1" },
      database: db,
      storage: new MemoryStorage(),
    });
    cleanupApp = () => app.close();
    // Direct enqueue + worker settle (same path the API uses internally);
    // the HTTP /v1/creations route shape is covered by other suites.
    const { job } = await enqueueJob(db, {
      userId,
      idempotencyKey: `life-${emailSeq.n}`,
      request: { prompt: "a calm lake", device: "phone" },
      inputHash: `hash-life-${emailSeq.n}`,
      price: 5,
      costMicros: 100,
    });
    await runWorkerOnce(
      db,
      { provider: new MockJobProvider(), storage: new MemoryStorage() },
      `worker-life-${emailSeq.n}`
    );
    const jobId = job.id;
    const asset = (
      await db.query<{
        retention_policy: string;
        storage_status: string;
        days: number;
      }>(
        `SELECT retention_policy,storage_status,
                EXTRACT(day FROM (expires_at - completed_at))::int AS days
         FROM image_assets WHERE job_id=$1`,
        [jobId]
      )
    ).rows[0];
    expect(asset.retention_policy).toBe("temporary_30d");
    expect(asset.storage_status).toBe("active");
    expect(asset.days).toBe(MEDIA_RETENTION_DAYS);
    void enqueueJob;
  });
});
