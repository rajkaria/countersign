import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { issueChallenge,consumeChallenge,authorize,digest,type Actor } from '../../src/lib/server/auth';
import { saveRecord,getRecord } from '../../src/lib/server/records';
import type { Database } from '../../src/lib/server/db';
let pg:PGlite,db:Database;
const orgA='11111111-1111-4111-8111-111111111111',orgB='22222222-2222-4222-8222-222222222222';
const account=privateKeyToAccount(`0x${'19'.repeat(32)}`);
const owner:Actor={wallet:account.address.toLowerCase(),organizationId:orgA,role:'owner'};
describe('authenticated tenant boundary and controlled changes',()=>{
 beforeAll(async()=>{pg=new PGlite();await pg.exec(await readFile('migrations/001_foundation.sql','utf8'));db=pg as unknown as Database;await pg.query('INSERT INTO organizations(id,name) VALUES($1,$2),($3,$4)',[orgA,'A',orgB,'B']);await pg.query("INSERT INTO members VALUES($1,$2,'owner')",[orgA,owner.wallet]);process.env.APP_ORIGIN='http://localhost:3000';});
 afterAll(()=>pg.close());
 it('consumes the exact signed nonce once and rejects workspace escalation',async()=>{
  const challenge=await issueChallenge(db,account.address);const signature=await account.signMessage({message:challenge.message});const token=await consumeChallenge(db,challenge.challengeId,signature);
  await expect(consumeChallenge(db,challenge.challengeId,signature)).rejects.toThrow(/already used/);
  const request=new Request('http://localhost:3000',{headers:{cookie:`cs_session=${token}`}});
  expect((await authorize(db,request,orgA)).role).toBe('owner');
  await expect(authorize(db,request,orgB)).rejects.toThrow(/access/);
  await pg.query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);
  await expect(authorize(db,request,orgA)).rejects.toThrow(/expired/);
 });
 it('rejects unauthorized vendor writes and prevents cross-tenant object reads',async()=>{
  const body={name:'Studio',destination:'0x1111111111111111111111111111111111111111',chainId:5042002,verified:true,verificationNote:'Confirmed via existing business contact'};
  await expect(saveRecord(db,{...owner,role:'operator'},'vendor',body)).rejects.toThrow(/role/);
  const vendor=await saveRecord(db,owner,'vendor',body);
  await expect(getRecord(db,{...owner,organizationId:orgB},'vendor',vendor.id)).rejects.toThrow(/not found/);
  await expect(saveRecord(db,owner,'vendor',{...body,destination:'0x2222222222222222222222222222222222222222'},vendor.id,1)).rejects.toThrow(/destination-change/);
  await expect(saveRecord(db,owner,'vendor',body,vendor.id,7)).rejects.toThrow(/changed/);
 });
});
