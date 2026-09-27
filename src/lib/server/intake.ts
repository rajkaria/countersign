import { createHash } from 'node:crypto';
import { type Database,ServiceError } from './db';
import { type Actor,requireRole } from './auth';
import { saveRecord,listRecords } from './records';
export function parseCsv(text:string):string[][]{
 if(Buffer.byteLength(text)>1048576)throw new ServiceError(413,'CSV_SIZE','CSV must be smaller than 1 MB.');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw new ServiceError(400,'CSV_FORMAT','Unexpected quote in CSV.');quoted=true;}
  else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x.length))rows.push(row);row=[];}}
  else{if(closed)throw new ServiceError(400,'CSV_FORMAT','Unexpected text after a quoted value.');cell+=c;}
 }
 if(quoted)throw new ServiceError(400,'CSV_FORMAT','A quoted CSV field is not closed.');row.push(cell);if(row.some(x=>x.length))rows.push(row);if(rows.length>501)throw new ServiceError(400,'CSV_ROWS','Import no more than 500 invoices at a time.');return rows;
}
export async function importInvoices(db:Database,actor:Actor,text:string,dryRun=true){
 requireRole(actor,['owner','approver','operator']);const rows=parseCsv(text),headers=rows.shift()?.map(x=>x.trim());const required=['engagement_id','reference','amount_usdc','period_start','period_end','due_date','description'];
 if(!headers||required.some(h=>!headers.includes(h))||new Set(headers).size!==headers.length)throw new ServiceError(400,'CSV_HEADERS',`CSV needs unique headers: ${required.join(', ')}.`);
 const engagements=await listRecords(db,actor,'engagement'),vendors=await listRecords(db,actor,'vendor');const hash=createHash('sha256').update(text).digest('hex');const results=[];
 for(let i=0;i<rows.length;i++){
  try{if(rows[i].length!==headers.length)throw new Error('Column count does not match the header.');const value=Object.fromEntries(headers.map((h,j)=>[h,rows[i][j].trim()]));const engagement=engagements.find(e=>e.id===value.engagement_id);if(!engagement)throw new Error('Agreement not found in this workspace.');const vendor=vendors.find(v=>v.id===engagement.body.vendorId);if(!vendor)throw new Error('Vendor not found.');if(!/^\d+(\.\d{1,6})?$/.test(value.amount_usdc))throw new Error('Amount must be a decimal USDC value.');const [whole,fraction='']=value.amount_usdc.split('.');const amount=(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'))).toString();
   const body={vendorId:vendor.id,engagementId:engagement.id,reference:value.reference,amount,periodStart:value.period_start,periodEnd:value.period_end,dueDate:value.due_date,description:value.description,destination:String(vendor.body.destination)};
   const {schemas}=await import('./records');schemas.invoice.parse(body);
   if(amount==='0'||value.period_start>value.period_end)throw new Error('Amount or billing period is invalid.');
   const externalId=`csv:${hash}:${i}`,existing=await db.query('SELECT body FROM intake_events WHERE organization_id=$1 AND external_id=$2',[actor.organizationId,externalId]);if(existing.rows.length){results.push({row:i+2,status:'duplicate',reference:value.reference});continue;}
   if(dryRun){results.push({row:i+2,status:'valid',reference:value.reference,amount});continue;}
   const result=await saveRecord(db,actor,'invoice',body);await db.query('INSERT INTO intake_events(organization_id,external_id,body) VALUES($1,$2,$3)',[actor.organizationId,externalId,JSON.stringify({invoiceId:result.id})]);results.push({row:i+2,status:'imported',id:result.id,reference:value.reference});
  }catch(error){results.push({row:i+2,status:'error',message:error instanceof Error?error.message:'Invalid row.'});if(!dryRun)throw new ServiceError(400,'IMPORT_ABORTED',`Row ${i+2} failed. No rows were committed; use dry-run to correct the file.`);}
 }
 return {dryRun,rows:results,sourceCommitment:hash};
}
