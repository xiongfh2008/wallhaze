import { describe, expect, it } from 'vitest';
import { createMemoryDatabase } from '../src/db/database.js';
import { migrate, rollbackEmptyDatabase } from '../src/db/migrate.js';

describe('actual PostgreSQL migrations', () => {
  it('applies once, detects drift, enforces constraints, and rolls back empty schema', async () => {
    const db = await createMemoryDatabase();
    try {
      await migrate(db); await migrate(db);
      expect((await db.query('select * from schema_migrations')).rows).toHaveLength(6);
      await expect(db.query("insert into users(id,email,password_hash,status) values ('bad','bad','x','invalid')")).rejects.toThrow();
      await db.query("update schema_migrations set checksum='tampered'");
      await expect(migrate(db)).rejects.toThrow(/drift/);
    } finally { await db.close(); }
    const empty = await createMemoryDatabase();
    try { await migrate(empty); await rollbackEmptyDatabase(empty); await migrate(empty); }
    finally { await empty.close(); }
  });
  it('rolls back failed transactions', async () => {
    const db = await createMemoryDatabase(); await migrate(db);
    try {
      await expect(db.transaction(async tx => { await tx.query("insert into users(id,email,password_hash) values ('u','u@x','x')"); throw new Error('crash'); })).rejects.toThrow('crash');
      expect((await db.query('select * from users')).rows).toHaveLength(0);
    } finally { await db.close(); }
  });
});
