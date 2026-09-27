import { createHash, randomBytes } from 'node:crypto';
import { verifyMessage, getAddress, type Address, type Hex } from 'viem';
import type { Database } from './db';
import { id, ServiceError } from './db';
export const digest = (value:string) => createHash('sha256').update(value).digest('hex');
export interface Actor {wallet:string;organizationId:string;role:'owner'|'approver'|'operator'|'viewer'}
export async function limit(db:Database,key:string,max=30,seconds=60){
 const result=await db.query<{count:number}>(`INSERT INTO rate_limits(key,count,resets_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.resets_at<now() THEN 1 ELSE rate_limits.count+1 END,resets_at=CASE WHEN rate_limits.resets_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.resets_at END RETURNING count`,[key,seconds]);
 if(result.rows[0].count>max)throw new ServiceError(429,'RATE_LIMIT','Too many requests. Please try again shortly.');
}
export function origin():string{return new URL(process.env.APP_ORIGIN || 'http://localhost:3000').origin;}
export function checkOrigin(request:Request){if(request.headers.get('origin')!==origin())throw new ServiceError(403,'ORIGIN','Request origin is not permitted.');}
export async function issueChallenge(db:Database,wallet:string){
 let address:Address;try{address=getAddress(wallet);}catch{throw new ServiceError(400,'WALLET','Enter a valid Ethereum address.');}
 await limit(db,`challenge:${address.toLowerCase()}`,5,300);
 const challengeId=id(), nonce=randomBytes(24).toString('hex'),expiresAt=new Date(Date.now()+300000).toISOString();
 const message=`${new URL(origin()).host} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Countersign. This grants no spending permission.\n\nURI: ${origin()}\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${expiresAt}`;
 await db.query('INSERT INTO auth_challenges(id,wallet,message,expires_at) VALUES($1,$2,$3,$4)',[challengeId,address.toLowerCase(),message,expiresAt]);
 return {challengeId,message,expiresAt};
}
export async function consumeChallenge(db:Database,challengeId:string,signature:Hex){
 const result=await db.query<{wallet:string;message:string}>('SELECT wallet,message FROM auth_challenges WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE',[challengeId]);
 const challenge=result.rows[0];if(!challenge)throw new ServiceError(401,'CHALLENGE_EXPIRED','Sign-in request expired or was already used.');
 if(!await verifyMessage({address:challenge.wallet as Address,message:challenge.message,signature}))throw new ServiceError(401,'SIGNATURE','The signature does not match this sign-in request.');
 await db.query('UPDATE auth_challenges SET consumed_at=now() WHERE id=$1',[challengeId]);
 const token=randomBytes(32).toString('base64url');
 await db.query("INSERT INTO sessions(token_hash,wallet,expires_at) VALUES($1,$2,now()+interval '12 hours')",[digest(token),challenge.wallet]);
 return token;
}
export async function sessionWallet(db:Database,request:Request){
 const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('cs_session='))?.slice(11);
 if(!token)throw new ServiceError(401,'SIGN_IN','Sign in to continue.');
 const result=await db.query<{wallet:string}>('SELECT wallet FROM sessions WHERE token_hash=$1 AND expires_at>now()',[digest(token)]);
 if(!result.rows[0])throw new ServiceError(401,'SESSION_EXPIRED','Your session expired. Sign in again.');
 return result.rows[0].wallet;
}
export async function authorize(db:Database,request:Request,organizationId:string):Promise<Actor>{
 const wallet=await sessionWallet(db,request);
 const member=(await db.query<{role:Actor['role']}>('SELECT role FROM members WHERE organization_id=$1 AND wallet=$2',[organizationId,wallet])).rows[0];
 if(!member)throw new ServiceError(403,'MEMBERSHIP','You do not have access to this workspace.');
 return {wallet,organizationId,role:member.role};
}
export function requireRole(actor:Actor,roles:Actor['role'][]){if(!roles.includes(actor.role))throw new ServiceError(403,'ROLE','Your workspace role cannot perform this action.');}
