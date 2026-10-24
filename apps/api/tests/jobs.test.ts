import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createMemoryDatabase, type Database } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';
import { credit, getWallet } from '../src/business/wallet.js';
import {
  enqueueJob,
  claimJob,
  completeJob,
  failJob,
  getJob,
} from '../src/business/jobs.js';
import { runWorkerOnce } from '../src/business/worker.js';
import { reconcileAll, sweepStaleJobs } from '../src/business/maintenance.js';
import { MockJobProvider } from '../src/business/providers.js';
import { createMockPng } from '../src/business/mock-image.js';
import { MemoryStorage } from '../src/business/storage.js';

describe('async generation jobs', () => {
  let db: Database;
  beforeEach(async () => {
    db = await createMemoryDatabase();
    await migrate(db);
    await db.query("insert into users(id,email,password_hash) values ('u','u@x','x')");
    await db.transaction(tx => credit(tx, 'u', 50, 'seed', 'purchase'));
  });
  afterEach(async () => { await db.close(); });

  const enqueue = (id: string, price = 5) =>
    enqueueJob(db, {
      userId: 'u',
      idempotencyKey: id,
      request: { prompt: 'wallpaper', device: 'desktop' },
      inputHash: 'hash-' + id,
      price,
      costMicros: 100,
    });

  it('persists job and reservation atomically, dedupes, and rejects without funds', async () => {
    const first = await enqueue('job-1');
    expect(first.deduped).toBe(false);
    expect(first.job.status).toBe('queued');
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 50, reserved: 5 });

    const replay = await enqueue('job-1');
    expect(replay.deduped).toBe(true);
    expect(replay.job.id).toBe(first.job.id);
    expect(await getWallet(db, 'u')).toMatchObject({ reserved: 5 });

    await expect(enqueue('job-2', 100)).rejects.toMatchObject({ code: 'CONFLICT' });
    const orphan = (await db.query("SELECT count(*)::int AS n FROM generation_jobs WHERE idempotency_key='job-2'")).rows[0];
    expect(orphan.n).toBe(0);
    expect(await getWallet(db, 'u')).toMatchObject({ reserved: 5 });
  });

  it('enforces persisted daily cost budgets before reservation', async () => {
    await expect(
      enqueueJob(db, {
        userId: 'u', idempotencyKey: 'budget-1',
        request: { prompt: 'x', device: 'desktop' }, inputHash: 'h',
        price: 5, costMicros: 1000, userDailyCostMicrosLimit: 999,
      })
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect((await db.query("SELECT count(*)::int AS n FROM generation_jobs WHERE idempotency_key='budget-1'")).rows[0].n).toBe(0);
    expect(await getWallet(db, 'u')).toMatchObject({ reserved: 0 });
  });

  it('claims jobs exclusively, fences stale workers, and settles exactly once', async () => {
    await enqueue('job-a'); await enqueue('job-b');
    const w1 = await claimJob(db, { workerId: 'w1', leaseSeconds: 60 });
    const w2 = await claimJob(db, { workerId: 'w2', leaseSeconds: 60 });
    expect(w1 && w2).toBeTruthy();
    expect(new Set([w1!.jobId, w2!.jobId]).size).toBe(2);
    expect(await claimJob(db, { workerId: 'w3', leaseSeconds: 60 })).toBeNull();

    // Stale worker (w1's token) cannot complete w2's claim.
    await expect(completeJob(db, {
      jobId: w2!.jobId, leaseToken: w1!.leaseToken, userId: w2!.userId,
      storageKey: w2!.jobId, mime: 'image/png', sizeBytes: 10,
    })).rejects.toThrow(/fenced|lease/i);

    await completeJob(db, {
      jobId: w2!.jobId, leaseToken: w2!.leaseToken, userId: w2!.userId,
      storageKey: w2!.jobId, mime: 'image/png', sizeBytes: 10,
    });
    // Replay of the same completion must not double-charge.
    await expect(completeJob(db, {
      jobId: w2!.jobId, leaseToken: w2!.leaseToken, userId: w2!.userId,
      storageKey: w2!.jobId, mime: 'image/png', sizeBytes: 10,
    })).rejects.toThrow(/fenced|lease|status/i);
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 45, reserved: 5 });

    // Expired lease → another worker reclaims and fails the job → release.
    await db.query("UPDATE generation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [w1!.jobId]);
    const reclaimed = await claimJob(db, { workerId: 'w2', leaseSeconds: 60 });
    expect(reclaimed?.jobId).toBe(w1!.jobId);
    expect(reclaimed!.attempt).toBe(2);
    await failJob(db, { jobId: reclaimed!.jobId, leaseToken: reclaimed!.leaseToken, errorCode: 'UPSTREAM_ERROR' });
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 45, reserved: 0 });
    expect(await getJob(db, 'u', w1!.jobId)).toMatchObject({ status: 'failed', errorCode: 'UPSTREAM_ERROR' });
  });

  it('keeps credits held when image storage fails, then releases on worker fail', async () => {
    await enqueue('job-s');
    const claim = (await claimJob(db, { workerId: 'w1', leaseSeconds: 60 }))!;
    await failJob(db, { jobId: claim.jobId, leaseToken: claim.leaseToken, errorCode: 'STORAGE_FAILED', providerBilled: true });
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 50, reserved: 0 });
    expect(await getJob(db, 'u', claim.jobId)).toMatchObject({ status: 'failed', errorCode: 'STORAGE_FAILED' });
    const budget = (await db.query("SELECT spent FROM generation_budgets WHERE scope_id='u'")).rows[0];
    expect(Number(budget.spent)).toBe(100); // possible provider cost retained
  });

  it('sweeps stale leases, releases held credits, and reconciles every wallet', async () => {
    const { job } = await enqueue('job-stale');
    const claim = (await claimJob(db, { workerId: 'w-dead', leaseSeconds: 1 }))!;
    await db.query("UPDATE generation_jobs SET lease_expires_at=now()-interval '1 hour' WHERE id=$1", [claim.jobId]);
    const swept = await sweepStaleJobs(db, { staleAfterMinutes: 30 });
    expect(swept.failed).toBe(1);
    expect(await getJob(db, 'u', job.id)).toMatchObject({ status: 'failed', errorCode: 'WORKER_LOST' });
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 50, reserved: 0 });
    const report = await reconcileAll(db);
    expect(report.checked).toBe(1);
    expect(report.mismatches).toEqual([]);
    // A fresh expired-but-not-stale lease is left for its worker.
    const { job: fresh } = await enqueue('job-fresh');
    await claimJob(db, { workerId: 'w2', leaseSeconds: 1 });
    expect((await sweepStaleJobs(db, { staleAfterMinutes: 30 })).failed).toBe(0);
    expect(await getJob(db, 'u', fresh.id)).toMatchObject({ status: 'running' });
  });

  it('does not charge Credits for a mock success', async () => {
    const { job } = await enqueue('job-mock');
    const claim = (await claimJob(db, { workerId: 'w-mock', leaseSeconds: 60 }))!;
    await completeJob(db, {
      jobId: claim.jobId,
      leaseToken: claim.leaseToken,
      userId: claim.userId,
      storageKey: 'mock-key',
      mime: 'image/png',
      sizeBytes: 100,
      mock: true,
    });
    expect(await getJob(db, 'u', job.id)).toMatchObject({ status: 'succeeded' });
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 50, reserved: 0 });
  });

  it('removes the reference image from the stored request once settled', async () => {
    const refImage = `data:image/png;base64,${Buffer.from(
      '89504e470d0a1a0a00000000',
      'hex'
    ).toString('base64')}`;
    const { job } = await enqueueJob(db, {
      userId: 'u',
      idempotencyKey: 'ref-job',
      request: { prompt: 'cat in a forest', device: 'phone', refImage },
      inputHash: 'ref-hash',
      price: 5,
      costMicros: 100,
    });
    await runWorkerOnce(db, { provider: new MockJobProvider(), storage: new MemoryStorage() }, 'worker-ref');
    const stored = (await db.query('SELECT request FROM generation_jobs WHERE id=$1', [job.id])).rows[0].request as Record<string, unknown>;
    expect(stored.refImage).toBeUndefined();
    expect(stored.prompt).toBe('cat in a forest');
  });

  it('runs end-to-end with the mock provider and memory storage', async () => {
    const { job } = await enqueue('job-e2e');
    const storage = new MemoryStorage();
    const claimed = await runWorkerOnce(db, { provider: new MockJobProvider(), storage }, 'worker-1');
    expect(claimed).toBe(true);
    expect(await getJob(db, 'u', job.id)).toMatchObject({ status: 'succeeded' });
    const asset = await storage.get(job.id);
    expect(asset.mime).toBe('image/png');
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 45, reserved: 0 });
    expect(await runWorkerOnce(db, { provider: new MockJobProvider(), storage }, 'worker-1')).toBe(false);
  });

  it('enforces the platform-wide daily cost budget', async () => {
    const first = await enqueueJob(db, {
      userId: 'u', idempotencyKey: 'platform-1',
      request: { prompt: 'x', device: 'desktop' }, inputHash: 'p1',
      price: 5, costMicros: 100, platformDailyCostMicrosLimit: 150,
    });
    expect(first.job.status).toBe('queued');

    await expect(
      enqueueJob(db, {
        userId: 'u', idempotencyKey: 'platform-2',
        request: { prompt: 'x', device: 'desktop' }, inputHash: 'p2',
        price: 5, costMicros: 100, platformDailyCostMicrosLimit: 150,
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    expect((await db.query('SELECT count(*)::int AS n FROM generation_jobs')).rows[0].n).toBe(1);
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 50, reserved: 5 });
    const platform = (await db.query("SELECT reserved FROM generation_budgets WHERE scope='platform'")).rows[0];
    expect(Number(platform.reserved)).toBe(100);
  });

  it('treats a zero platform budget as a hard stop', async () => {
    await expect(
      enqueueJob(db, {
        userId: 'u', idempotencyKey: 'platform-zero',
        request: { prompt: 'x', device: 'desktop' }, inputHash: 'pz',
        price: 5, costMicros: 100, platformDailyCostMicrosLimit: 0,
      })
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 50, reserved: 0 });
    expect((await db.query('SELECT count(*)::int AS n FROM generation_jobs')).rows[0].n).toBe(0);
  });

  it('does not claim or call the provider while paused', async () => {
    const { job } = await enqueue('paused-job');
    const storage = new MemoryStorage();
    let calls = 0;
    const provider = {
      async generate() {
        calls += 1;
        return { bytes: createMockPng(), mime: 'image/png' };
      },
    };
    expect(
      await runWorkerOnce(db, { provider, storage, paused: true }, 'paused-worker')
    ).toBe(false);
    expect(calls).toBe(0);
    expect(await getJob(db, 'u', job.id)).toMatchObject({ status: 'queued' });
    expect(await getWallet(db, 'u')).toMatchObject({ reserved: 5 });
  });

  it('never re-calls the provider for a reclaimed live job', async () => {
    const { job } = await enqueue('uncertain-job');
    const stale = (await claimJob(db, { workerId: 'dead', leaseSeconds: 1 }))!;
    await db.query(
      "UPDATE generation_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [stale.jobId]
    );

    let calls = 0;
    const provider = {
      async generate() {
        calls += 1;
        return { bytes: createMockPng(), mime: 'image/png' };
      },
    };
    const processed = await runWorkerOnce(
      db,
      { provider, storage: new MemoryStorage(), mock: false },
      'alive-worker'
    );
    expect(processed).toBe(true);
    expect(calls).toBe(0); // no second paid call
    expect(await getJob(db, 'u', job.id)).toMatchObject({
      status: 'failed',
      errorCode: 'UPSTREAM_UNCERTAIN',
    });
    expect(await getWallet(db, 'u')).toMatchObject({ credits: 50, reserved: 0 });
    const budget = (await db.query("SELECT spent FROM generation_budgets WHERE scope='user' AND scope_id='u'")).rows[0];
    expect(Number(budget.spent)).toBe(100); // possible provider cost retained
  });
});
