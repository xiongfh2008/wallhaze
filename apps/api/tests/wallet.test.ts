import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createMemoryDatabase, type Database } from '../src/db/database.js';
import { migrate } from '../src/db/migrate.js';
import { credit, reserve, capture, release, refund, getWallet, reconcile } from '../src/business/wallet.js';
describe('transactional credit ledger', () => {
  let db: Database;
  beforeEach(async () => { db = await createMemoryDatabase(); await migrate(db); await db.query("insert into users(id,email,password_hash) values ('u','u@x','x')"); });
  afterEach(async () => { await db.close(); });
  const job = async (id: string) => db.query("insert into generation_jobs(id,user_id,request,idempotency_key,credits,cost_micros) values ($1,'u','{}',$1,5,100)",[id]);
  it('creates an empty wallet and idempotently credits with audited changes', async () => {
    expect(await getWallet(db,'u')).toMatchObject({credits:0,reserved:0,debt:0});
    await db.transaction(tx => credit(tx,'u',10,'order1','purchase'));
    await db.transaction(tx => credit(tx,'u',10,'order1','purchase'));
    await expect(db.transaction(tx => credit(tx,'u',11,'order1','purchase'))).rejects.toThrow(/idempotency/);
    expect(await getWallet(db,'u')).toMatchObject({credits:10,reserved:0});
    expect(await db.transaction(tx => reconcile(tx,'u'))).toMatchObject({matches:true});
  });
  it('serializes competing reservations and settles each only once', async () => {
    await job('a'); await job('b'); await db.transaction(tx => credit(tx,'u',5,'order','purchase'));
    const results=await Promise.allSettled(['a','b'].map(id=>db.transaction(tx=>reserve(tx,'u',id,5))));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await db.transaction(tx=>reserve(tx,'u','a',5));
    await db.transaction(tx=>capture(tx,'u','a')); await db.transaction(tx=>capture(tx,'u','a')); await db.transaction(tx=>release(tx,'u','a'));
    expect(await getWallet(db,'u')).toMatchObject({credits:0,reserved:0,debt:0});
    expect(await db.transaction(tx=>reconcile(tx,'u'))).toMatchObject({matches:true});
  });
  it('releases once and rolls back reservation on a crash', async()=>{
    await job('a'); await db.transaction(tx=>credit(tx,'u',5,'order','purchase'));
    await expect(db.transaction(async tx=>{await reserve(tx,'u','a',5); throw new Error('crash');})).rejects.toThrow('crash');
    expect(await getWallet(db,'u')).toMatchObject({reserved:0});
    await db.transaction(tx=>reserve(tx,'u','a',5)); await db.transaction(tx=>release(tx,'u','a')); await db.transaction(tx=>release(tx,'u','a'));
    expect(await getWallet(db,'u')).toMatchObject({credits:5,reserved:0});
  });
  it('records refund shortfall as debt, freezes spending, and reconciles',async()=>{
    await job('a'); await db.transaction(tx=>credit(tx,'u',10,'order','purchase')); await db.transaction(tx=>reserve(tx,'u','a',5)); await db.transaction(tx=>capture(tx,'u','a'));
    await db.transaction(tx=>refund(tx,'u',10,'refund')); await db.transaction(tx=>refund(tx,'u',10,'refund'));
    expect(await getWallet(db,'u')).toMatchObject({credits:0,reserved:0,debt:5});
    expect((await db.query("select status from users where id='u'")).rows[0].status).toBe('suspended');
    expect(await db.transaction(tx=>reconcile(tx,'u'))).toMatchObject({matches:true});
    await expect(db.query("update credit_ledger set reason='tamper'")).rejects.toThrow(/immutable/);
  });
});
