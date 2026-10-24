import {describe,it,expect} from 'vitest';
import {MemoryStorage,LocalStorage,validateImage,downloadImage} from '../src/business/storage.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const png=Buffer.from('89504e470d0a1a0a00000000','hex');
describe('private image storage',()=>{
 it('rejects MIME mismatch and oversized payloads',()=>{expect(()=>validateImage(png,'image/jpeg')).toThrow();expect(()=>validateImage(png,'image/png',4)).toThrow();});
 it('copies memory bytes and deletes private keys',async()=>{const s=new MemoryStorage();await s.put('abc',png,'image/png');const b=await s.get('abc');b.bytes[0]=0;expect((await s.get('abc')).bytes[0]).toBe(137);await s.delete('abc');await expect(s.get('abc')).rejects.toThrow();});
 it('stores local files privately and rejects path traversal',async()=>{const root=await mkdtemp(join(tmpdir(),'wallhaze-'));try{const s=new LocalStorage(root);await s.put('abc',png,'image/png');expect((await s.get('abc')).bytes).toEqual(png);await expect(s.put('../escape',png,'image/png')).rejects.toThrow();await s.delete('abc');}finally{await rm(root,{recursive:true,force:true});}});
 it('blocks untrusted hosts and redirects before consuming images',async()=>{let calls=0;const fetcher=async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1'}});};await expect(downloadImage('http://127.0.0.1/a',fetcher)).rejects.toThrow();expect(calls).toBe(0);await expect(downloadImage('https://v3b.fal.media/a',fetcher)).rejects.toThrow();expect(calls).toBe(1);});
});
