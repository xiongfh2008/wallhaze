import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
export interface Sql { query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{rows:T[]}> }
export interface Database extends Sql { transaction<T>(fn:(tx:Sql)=>Promise<T>):Promise<T>; close():Promise<void> }

/** Serializes access to one PGlite instance (single connection). */
function wrapPglite(engine: PGlite): Database {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn:()=>Promise<T>):Promise<T> => { const result=tail.then(fn); tail=result.catch(()=>{}); return result; };
  const makeSql = (target: { query<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{rows:T[]}>; exec(sql: string): Promise<unknown> }): Sql => ({
    query: async <T extends Record<string,unknown>>(sql:string,params?:unknown[]) => {
      if (!params && sql.includes(';')) { await target.exec(sql); return {rows:[] as T[]}; }
      const result=await target.query<T>(sql,params); return {rows:result.rows};
    }
  });
  const tx = makeSql(engine);
  return {
    query:(sql,params)=>serial(()=>tx.query(sql,params)),
    transaction: fn => serial(() => engine.transaction(async inner => fn(makeSql(inner)))),
    close:()=>serial(()=>engine.close()),
  };
}

export async function createMemoryDatabase():Promise<Database> {
  const engine = new PGlite(); await engine.waitReady;
  return wrapPglite(engine);
}

/**
 * File-backed PGlite for LOCAL DEVELOPMENT ONLY (single process, no
 * concurrency safety across processes). Production must use PostgreSQL via
 * DATABASE_URL.
 */
export async function createPgliteDatabase(dir:string):Promise<Database> {
  const engine = await PGlite.create(dir); await engine.waitReady;
  return wrapPglite(engine);
}
export function createPostgresDatabase(url:string):Database {
  const pool=new pg.Pool({connectionString:url});
  const query:Sql['query']=async(sql,params)=>{const result=await pool.query(sql,params);return {rows:result.rows};};
  return {query,transaction:async fn=>{const client=await pool.connect();try{await client.query('BEGIN'); const value=await fn({query:async(sql,params)=>{const result=await client.query(sql,params);return {rows:result.rows};}});await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}},close:()=>pool.end()};
}
