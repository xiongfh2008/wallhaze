import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDatabase, type Database } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';
import { cleanupRetention } from '../src/business/maintenance.js';

describe('retention cleanup', () => {
  let db: Database;
  beforeEach(async () => { db = await createMemoryDatabase(); await migrate(db); });
  afterEach(async () => { await db.close(); });

  it('removes only expired auxiliary rows and never touches the ledger', async () => {
    await db.query(
      "INSERT INTO auth_attempts(bucket,count,window_start) VALUES('old',3,now()-interval '2 days'),('fresh',1,now())"
    );
    await db.query(
      "INSERT INTO payment_webhook_events(provider,event_id,payload,status,received_at) VALUES('mock','old','{}','processed',now()-interval '91 days'),('mock','fresh','{}','processed',now()),('mock','old-failed','{}','failed',now()-interval '91 days')"
    );
    const result = await cleanupRetention(db);
    expect(result.authAttempts).toBe(1);
    expect(result.webhookEvents).toBe(1);
    expect((await db.query('SELECT bucket FROM auth_attempts')).rows).toEqual([{ bucket: 'fresh' }]);
    const events = (await db.query('SELECT event_id FROM payment_webhook_events ORDER BY event_id')).rows;
    // Processed-but-old is removed; failed rows are retained for investigation.
    expect(events.map((e) => e.event_id)).toEqual(['fresh', 'old-failed']);
    expect((await db.query('SELECT count(*)::int AS n FROM credit_ledger')).rows[0].n).toBe(0);
  });
});
