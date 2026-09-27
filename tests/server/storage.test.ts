import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
let db:PGlite;
describe('durable storage invariants',()=>{
 beforeAll(async()=>{db=new PGlite();await db.exec(await readFile('migrations/001_foundation.sql','utf8'));});
 afterAll(async()=>{await db.close();});
 it('enforces one active financial operation per invoice across competing requests',async()=>{
  await db.exec("INSERT INTO organizations(id,name) VALUES('11111111-1111-4111-8111-111111111111','Acme')");
  const sql="INSERT INTO payment_intents(id,organization_id,invoice_id,engagement_id,idempotency_key,amount,state,permit) VALUES($1,'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',$2,100,'prepared','{}')";
  await db.query(sql,['44444444-4444-4444-8444-444444444444','first']);
  await expect(db.query(sql,['55555555-5555-4555-8555-555555555555','second'])).rejects.toThrow();
 });
 it('rejects a negative monetary allocation',async()=>{
  await expect(db.exec("UPDATE payment_intents SET amount=-1")).rejects.toThrow();
 });
 it('enables RLS for every data table',async()=>{
  const {rows}=await db.query<{relname:string}>('SELECT relname FROM pg_class WHERE relkind=\'r\' AND relnamespace=\'public\'::regnamespace AND NOT relrowsecurity');
  expect(rows.map(x=>x.relname)).toEqual(['schema_migrations']);
 });
});
