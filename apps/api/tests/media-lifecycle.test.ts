import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createMemoryDatabase, type Database } from "../src/db/database.js";
import { MemoryStorage } from "../src/business/storage.js";
import { MockJobProvider } from "../src/business/providers.js";
import { runWorkerOnce } from "../src/business/worker.js";
import { enqueueJob } from "../src/business/jobs.js";
import { credit } from "../src/business/wallet.js";
import {
  cleanupExpiredMedia,
  isAssetAccessible,
  retentionState,
} from "../src/business/media-lifecycle.js";

class FlakyStorage extends MemoryStorage {
  failures = 1;
  async delete(key: string): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("simulated delete failure");
    }
    return super.delete(key);
  }
}

describe("30-day media lifecycle", () => {
  let db: Database;
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    db = await createMemoryDatabase();
  });
  afterEach(async () => {
    await cleanup?.();
    await db.close();
  });

  async function boot(storage = new MemoryStorage()) {
    const { app } = await buildApp({
      env: {
        CORS_ALLOWED_ORIGINS: "https://web.example",
        FAL_MOCK: "1",
      },
      database: db,
      storage,
    });
    cleanup = async () => app.close();
    return app;
  }

  const WEB = {
    "x-wallhaze-client": "web",
    "content-type": "application/json",
    origin: "https://web.example",
  };

  async function signUp(app: Awaited<ReturnType<typeof boot>>, email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/signup",
      headers: WEB,
      payload: { email, password: "example-password-long" },
    });
    expect(res.statusCode).toBe(200);
    const user = (
      await db.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [
        email,
      ])
    ).rows[0];
    await db.transaction((tx) => credit(tx, user.id, 50, `fund-${email}`, "test"));
    return {
      userId: user.id,
      cookie: res.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    };
  }

  async function generate(
    userId: string,
    id: string,
    storage: MemoryStorage
  ): Promise<string> {
    const { job } = await enqueueJob(db, {
      userId,
      idempotencyKey: id,
      request: { prompt: "a quiet lake", device: "desktop" },
      inputHash: `hash-${id}`,
      price: 5,
      costMicros: 100,
    });
    expect(
      await runWorkerOnce(db, { provider: new MockJobProvider(), storage }, `worker-${id}`)
    ).toBe(true);
    return job.id;
  }

  it("sets completedAt/expiresAt 30 days apart for new assets", async () => {
    const app = await boot();
    const { userId } = await signUp(app, "thirty@example.test");
    const jobId = await generate(userId, "thirty-job", new MemoryStorage());
    const asset = (
      await db.query<{
        completed_at: string;
        expires_at: string;
        retention_policy: string;
        storage_status: string;
      }>(
        "SELECT completed_at,expires_at,retention_policy,storage_status FROM image_assets WHERE job_id=$1",
        [jobId]
      )
    ).rows[0];
    expect(asset.retention_policy).toBe("temporary_30d");
    expect(asset.storage_status).toBe("active");
    const days =
      (Date.parse(asset.expires_at) - Date.parse(asset.completed_at)) /
      86_400_000;
    expect(days).toBeCloseTo(30, 5);
  });

  it("hides and rejects expired signed media, then deletes idempotently", async () => {
    const storage = new MemoryStorage();
    const app = await boot(storage);
    const { userId, cookie } = await signUp(app, "expire@example.test");
    const jobId = await generate(userId, "expire-job", storage);
    const auth = { cookie };

    const ledgerBefore = (
      await db.query<{ n: number }>("SELECT count(*)::int AS n FROM credit_ledger")
    ).rows[0].n;
    const before = await app.inject({
      method: "GET",
      url: `/v1/creations/${jobId}`,
      headers: auth,
    });
    expect(before.statusCode).toBe(200);
    const signed = before.json().imageUrl as string;
    expect(signed).toContain(`/v1/creations/${jobId}/image`);
    expect(
      (await app.inject({ method: "GET", url: signed })).statusCode
    ).toBe(200);

    await db.query(
      "UPDATE image_assets SET expires_at=now()-interval '1 second' WHERE job_id=$1",
      [jobId]
    );

    const list = await app.inject({ method: "GET", url: "/v1/creations", headers: auth });
    expect(list.json().items[0]).toMatchObject({
      id: jobId,
      expired: true,
      imageUrl: null,
      retentionStatus: "expired",
    });
    expect(
      (await app.inject({ method: "GET", url: signed })).statusCode
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/v1/creations/${jobId}/download`,
          headers: auth,
        })
      ).statusCode
    ).toBe(404);

    const dry = await cleanupExpiredMedia(db, storage, { dryRun: true });
    expect(dry).toMatchObject({ scanned: 1, deleted: 0, failed: 0, dryRun: true });
    expect(await storage.get(jobId)).toBeTruthy();

    const actual = await cleanupExpiredMedia(db, storage, {
      dryRun: false,
      now: new Date(Date.now() + 60_000),
    });
    expect(actual).toMatchObject({ scanned: 1, deleted: 1, failed: 0, dryRun: false });
    await expect(storage.get(jobId)).rejects.toThrow("ASSET_MISSING");
    expect(
      (await db.query("SELECT storage_status,deleted_at FROM image_assets WHERE job_id=$1", [jobId])).rows[0]
    ).toMatchObject({ storage_status: "deleted" });
    expect(
      (await app.inject({ method: "GET", url: signed })).statusCode
    ).toBe(404);

    const replay = await cleanupExpiredMedia(db, storage, { dryRun: false });
    expect(replay).toMatchObject({ scanned: 0, deleted: 0, failed: 0 });
    expect(
      (await db.query("SELECT count(*)::int AS n FROM media_cleanup_runs")).rows[0].n
    ).toBe(3);
    expect((await db.query("SELECT count(*)::int AS n FROM credit_ledger")).rows[0].n).toBe(ledgerBefore);
  });

  it("retries a failed object deletion on the next pass", async () => {
    const storage = new FlakyStorage();
    const app = await boot(storage);
    const { userId } = await signUp(app, "retry@example.test");
    const jobId = await generate(userId, "retry-job", storage);
    await db.query(
      "UPDATE image_assets SET expires_at=now()-interval '1 second' WHERE job_id=$1",
      [jobId]
    );
    const first = await cleanupExpiredMedia(db, storage, { dryRun: false });
    expect(first).toMatchObject({ scanned: 1, deleted: 0, failed: 1 });
    expect(
      (await db.query("SELECT storage_status,delete_attempts FROM image_assets WHERE job_id=$1", [jobId])).rows[0]
    ).toMatchObject({ storage_status: "delete_failed", delete_attempts: 1 });

    await db.query(
      "UPDATE image_assets SET updated_at=now()-interval '1 minute' WHERE job_id=$1",
      [jobId]
    );
    const second = await cleanupExpiredMedia(db, storage, { dryRun: false });
    expect(second).toMatchObject({ scanned: 1, deleted: 1, failed: 0 });
    expect(
      (await db.query("SELECT storage_status,delete_attempts FROM image_assets WHERE job_id=$1", [jobId])).rows[0]
    ).toMatchObject({ storage_status: "deleted", delete_attempts: 2 });
  });

  it("recovers a crash after object deletion (deleting state)", async () => {
    const storage = new MemoryStorage();
    const app = await boot(storage);
    const { userId } = await signUp(app, "crash@example.test");
    const jobId = await generate(userId, "crash-job", storage);
    await db.query(
      "UPDATE image_assets SET expires_at=now()-interval '1 second',storage_status='deleting',updated_at=now()-interval '1 hour' WHERE job_id=$1",
      [jobId]
    );
    // Simulate the object disappearing before the database update.
    await storage.delete(jobId);
    const result = await cleanupExpiredMedia(db, storage, { dryRun: false });
    expect(result).toMatchObject({ scanned: 1, deleted: 1, failed: 0 });
    expect(
      (await db.query("SELECT storage_status,deleted_at FROM image_assets WHERE job_id=$1", [jobId])).rows[0]
    ).toMatchObject({ storage_status: "deleted" });
  });

  it("is safe when two cleanup passes race", async () => {
    const storage = new MemoryStorage();
    const app = await boot(storage);
    const { userId } = await signUp(app, "race@example.test");
    const jobId = await generate(userId, "race-job", storage);
    await db.query(
      "UPDATE image_assets SET expires_at=now()-interval '1 second' WHERE job_id=$1",
      [jobId]
    );
    const [a, b] = await Promise.all([
      cleanupExpiredMedia(db, storage, { dryRun: false }),
      cleanupExpiredMedia(db, storage, { dryRun: false }),
    ]);
    expect(a.deleted + b.deleted).toBe(1);
    expect(a.failed + b.failed).toBe(0);
    expect(
      (await db.query("SELECT storage_status,delete_attempts FROM image_assets WHERE job_id=$1", [jobId])).rows[0]
    ).toMatchObject({ storage_status: "deleted", delete_attempts: 1 });
  });

  it("never selects legacy or official assets", async () => {
    const storage = new MemoryStorage();
    const app = await boot(storage);
    const { userId } = await signUp(app, "legacy@example.test");
    const jobId = await generate(userId, "legacy-job", storage);
    await db.query(
      "UPDATE image_assets SET retention_policy='legacy',expires_at=now()-interval '1 year' WHERE job_id=$1",
      [jobId]
    );
    const result = await cleanupExpiredMedia(db, storage, { dryRun: false });
    expect(result).toMatchObject({ scanned: 0, deleted: 0, failed: 0 });
    expect(await storage.get(jobId)).toBeTruthy();
    const asset = (
      await db.query<{ retention_policy: string; expires_at: string; storage_status: string }>(
        "SELECT retention_policy,expires_at,storage_status FROM image_assets WHERE job_id=$1",
        [jobId]
      )
    ).rows[0];
    expect(asset).toMatchObject({ retention_policy: "legacy", storage_status: "active" });
    expect(
      isAssetAccessible({
        expiresAt: asset.expires_at,
        retentionPolicy: "legacy",
        storageStatus: "active",
      })
    ).toBe(true);
    expect(
      retentionState({
        expiresAt: asset.expires_at,
        retentionPolicy: "legacy",
        storageStatus: "active",
      })
    ).toBe("legacy");
  });
});
