import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Database } from './database.js';

/**
 * Ordered migrations, distributed alongside the independent API artifact.
 * Each file applies at most once; a checksum mismatch aborts startup
 * rather than silently drifting from the reviewed schema.
 */
const MIGRATIONS: ReadonlyArray<{ version: number; file: string }> = [
  { version: 1, file: '001_core.sql' },
  { version: 2, file: '002_packages.sql' },
  { version: 3, file: '003_payment_products.sql' },
  { version: 4, file: '004_checkout_url.sql' },
  { version: 5, file: '005_media.sql' },
  { version: 6, file: '006_media_lifecycle.sql' },
];

const siblingUrl = (file: string) => new URL(`../../migrations/${file}`, import.meta.url);
const artifactUrl = (file: string) => new URL(`../../../../migrations/${file}`, import.meta.url);

async function source(file: string): Promise<string> {
  try { return await readFile(siblingUrl(file), 'utf8'); }
  catch { return readFile(artifactUrl(file), 'utf8'); }
}

export async function migrate(db: Database): Promise<void> {
  await db.transaction(async tx => {
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    for (const migration of MIGRATIONS) {
      const sql = await source(migration.file);
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = (await tx.query('SELECT checksum FROM schema_migrations WHERE version=$1', [migration.version])).rows[0];
      if (prior) {
        if (prior.checksum !== checksum) throw new Error(`migration checksum drift at version ${migration.version}`);
        continue;
      }
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [migration.version, checksum]);
    }
  });
}

/** Destructive developer rollback, refused for any database containing users. Back up/restore populated production databases instead. */
export async function rollbackEmptyDatabase(db: Database): Promise<void> {
  await db.transaction(async tx => {
    await tx.query('LOCK TABLE users IN ACCESS EXCLUSIVE MODE');
    if ((await tx.query('SELECT id FROM users LIMIT 1')).rows.length) throw new Error('rollback refused: populated database');
    await tx.query('DROP TABLE media_cleanup_runs,credit_ledger,credit_reservations,image_assets,generation_attempts,generation_budgets,generation_control,generation_jobs,payment_webhook_events,payment_orders,payment_products,credit_packages,credit_wallets,account_deletion_requests,auth_sessions,auth_attempts,auth_accounts,users,schema_migrations; DROP FUNCTION reject_ledger_mutation()');
  });
}
