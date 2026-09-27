import {it,expect} from 'vitest';
import {parseCsv} from '../../src/lib/server/intake';
it('parses RFC quoted commas, escaped quotes and embedded newlines',()=>{expect(parseCsv('a,b\r\n"hello, there","a ""quote""\nand newline"')).toEqual([['a','b'],['hello, there','a "quote"\nand newline']]);});
it('rejects malformed and oversized CSV rather than shifting financial fields',()=>{expect(()=>parseCsv('a,"unclosed')).toThrow();expect(()=>parseCsv('"closed"junk,b')).toThrow();expect(()=>parseCsv('a\n'.repeat(503))).toThrow();});
