import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';
import { type Database,id,ServiceError } from './db';
import { type Actor,requireRole } from './auth';
import { audit } from './records';
function encryptionKey(){const key=Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY??'','base64');if(key.length!==32)throw new ServiceError(503,'DOCUMENT_STORAGE','Private document storage is not configured.');return key;}
export function sealDocument(bytes:Buffer,organizationId:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);cipher.setAAD(Buffer.from(organizationId));const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);return {iv,ciphertext,tag:cipher.getAuthTag(),commitment:createHash('sha256').update(randomBytes(32)).update(bytes).digest('hex')};}
export function openDocument(value:{iv:Buffer;ciphertext:Buffer;tag:Buffer},organizationId:string){const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),value.iv);cipher.setAAD(Buffer.from(organizationId));cipher.setAuthTag(value.tag);return Buffer.concat([cipher.update(value.ciphertext),cipher.final()]);}
export async function storeDocument(db:Database,actor:Actor,file:File){
 requireRole(actor,['owner','approver','operator']);
 if(file.size<1||file.size>5242880)throw new ServiceError(400,'FILE_SIZE','Upload a file between 1 byte and 5 MB.');
 const bytes=Buffer.from(await file.arrayBuffer());
 const allowed=['application/pdf','image/png','image/jpeg','text/csv','text/plain'];
 if(!allowed.includes(file.type))throw new ServiceError(400,'FILE_TYPE','Upload a PDF, PNG, JPEG, CSV, or text document.');
 if((file.type==='application/pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))||(file.type==='image/png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(file.type==='image/jpeg'&&(bytes[0]!==255||bytes[1]!==216)))throw new ServiceError(400,'FILE_CONTENT','File contents do not match the selected type.');
 const sealed=sealDocument(bytes,actor.organizationId),documentId=id();
 const filename=file.name.replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(0,160)||'document';
 await db.query('INSERT INTO documents(id,organization_id,filename,mime,byte_length,ciphertext,iv,tag,commitment,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[documentId,actor.organizationId,filename,file.type,bytes.length,sealed.ciphertext,sealed.iv,sealed.tag,sealed.commitment,actor.wallet]);
 await audit(db,actor,'document.uploaded',documentId,{mime:file.type,bytes:bytes.length});
 return {id:documentId,filename,mime:file.type,bytes:bytes.length,commitment:sealed.commitment};
}
