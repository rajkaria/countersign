import { Pool, type PoolClient, type QueryResultRow } from 'pg';
export interface Database { query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{rows:T[];rowCount?:number|null}>; }
let pool: Pool | undefined;
export function database(): Pool {
  if (!process.env.DATABASE_URL) throw new ServiceError(503, 'DATABASE_UNAVAILABLE', 'The live workspace is awaiting its dedicated database. The isolated demo remains available.');
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000, application_name: 'countersign' });
}
export class ServiceError extends Error { constructor(public status:number, public code:string, message:string){super(message);} }
export async function transaction<T>(fn:(db:Database)=>Promise<T>):Promise<T>{
  const client:PoolClient = await database().connect();
  try { await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result; }
  catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}
export const id = () => crypto.randomUUID();
