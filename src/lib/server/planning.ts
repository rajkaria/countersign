import {planCommitments} from '../domain';
import {type Actor,requireRole} from './auth';
import {type Database,id,ServiceError} from './db';
import {getRecord,listRecords,audit,lockOrganization} from './records';
import {evaluateInvoice} from './review';
/** The caller runs this in a transaction. Confirmed observations, not forecast fields, provide cash. */
export async function buildCashPlan(db:Database,actor:Actor,policyId:string){
 requireRole(actor,['owner','approver','operator']);await lockOrganization(db,actor);const policy=await getRecord(db,actor,'policy',policyId),safe=await getRecord(db,actor,'safe',String(policy.body.safeId));
 const observation=(await db.query<{id:string;body:Record<string,unknown>}>("SELECT id,body FROM records WHERE organization_id=$1 AND kind='chain_observation' AND body->>'safeId'=$2 ORDER BY created_at DESC LIMIT 1",[actor.organizationId,safe.id])).rows[0];
 if(!observation||Date.now()-Date.parse(String(observation.body.observedAt))>300000)throw new ServiceError(409,'STALE_BALANCE','Sync the Safe before planning against its confirmed balance.');
 const payments=(await db.query<{invoice_id:string;amount:string;state:string;source_confirmed_at:string|null}>('SELECT invoice_id,amount,state,source_confirmed_at FROM payment_intents WHERE organization_id=$1 AND state NOT IN (\'settled\',\'failed\')',[actor.organizationId])).rows;
 const observationTime=Date.parse(String(observation.body.observedAt));const pending=payments.filter(p=>!p.source_confirmed_at||Date.parse(p.source_confirmed_at)>observationTime).reduce((sum,p)=>sum+BigInt(p.amount),0n);
 const engagements=await listRecords(db,actor,'engagement');const invoices=(await listRecords(db,actor,'invoice')).filter(i=>!['paid','canceled'].includes(String(i.body.status))&&!payments.some(p=>p.invoice_id===i.id)&&engagements.some(e=>e.id===i.body.engagementId&&(!e.body.policyId||e.body.policyId===policyId)));
 const items=[];for(const invoice of invoices){const {decision}=await evaluateInvoice(db,actor,invoice.id);items.push({id:invoice.id,amount:(BigInt(String(invoice.body.amount))-BigInt(String(invoice.body.paidAmount??'0'))).toString(),fee:'0',dueAt:`${invoice.body.dueDate}T23:59:59Z`,priority:1,eligible:decision.action==='PAY',allowEarly:false});}
 const plan=planCommitments({confirmedCash:String(observation.body.balance),operatingReserve:(BigInt(String(policy.body.cashFloor))+BigInt(String(policy.body.feeReserve))).toString(),protectedReserve:String(policy.body.protectedAmount),pendingReserve:pending.toString(),expectedInflows:'0',now:new Date().toISOString(),items});
 const planId=id();await db.query("INSERT INTO records(organization_id,kind,id,body,created_by) VALUES($1,'payment_plan',$2,$3,$4)",[actor.organizationId,planId,JSON.stringify({...plan,policyId,policyVersion:policy.version,observationId:observation.id}),actor.wallet]);await audit(db,actor,'plan.created',planId,{policyId});return {id:planId,...plan};
}
