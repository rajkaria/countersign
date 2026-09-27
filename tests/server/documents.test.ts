import { expect,it } from 'vitest';
import { sealDocument,openDocument } from '../../src/lib/server/documents';
it('encrypts private evidence and authenticates tenant binding',()=>{
 process.env.DOCUMENT_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 const sealed=sealDocument(Buffer.from('private invoice'),'tenant-a');
 expect(sealed.ciphertext.toString()).not.toContain('private invoice');
 expect(openDocument(sealed,'tenant-a').toString()).toBe('private invoice');
 expect(()=>openDocument(sealed,'tenant-b')).toThrow();
 expect(sealDocument(Buffer.from('private invoice'),'tenant-a').commitment).not.toBe(sealed.commitment);
});
