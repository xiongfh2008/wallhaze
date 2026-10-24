import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {matchesDeclaredImageType} from '../modules/generation/generation.validators.js';

/** A private stored object. Videos and images share the same storage adapter. */
export interface StoredMedia {bytes:Buffer;mime:string}
/** Backwards-compatible alias used by the existing image pipeline/tests. */
export type StoredImage = StoredMedia;
export interface PrivateStorage {put(key:string,bytes:Buffer,mime:string):Promise<void>;get(key:string):Promise<StoredMedia>;delete(key:string):Promise<void>}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/**
 * MP4 sniffing. `ftyp` must be the first box after the 4-byte box size;
 * the brands cover standard ISO MP4, H.264 and fragmented MediaRecorder
 * output. We store only MP4 (the product contract), never arbitrary video.
 */
export function isMp4(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (bytes.toString('latin1', 4, 8) !== 'ftyp') return false;
  const brand = bytes.toString('latin1', 8, 12);
  return ['isom', 'iso2', 'iso4', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV'].includes(brand);
}

export function validateImage(bytes:Buffer,mime:string,max=MAX_IMAGE_BYTES){
  if(!bytes.length||bytes.length>max||!matchesDeclaredImageType(mime,bytes))throw new Error('INVALID_IMAGE');
}
export function validateVideo(bytes:Buffer,mime:string,max=MAX_VIDEO_BYTES){
  if(!bytes.length||bytes.length>max||mime!=='video/mp4'||!isMp4(bytes))throw new Error('INVALID_VIDEO');
}
/** Shared adapter guard: the declared MIME selects the matching validator. */
export function validateMedia(bytes:Buffer,mime:string){
  if(mime==='video/mp4')return validateVideo(bytes,mime);
  return validateImage(bytes,mime);
}
function keyCheck(key:string){if(!/^[a-zA-Z0-9_.-]{1,160}$/.test(key))throw new Error('INVALID_STORAGE_KEY');}

export class MemoryStorage implements PrivateStorage{
 private items=new Map<string,StoredMedia>();
 async put(key:string,bytes:Buffer,mime:string){keyCheck(key);validateMedia(bytes,mime);this.items.set(key,{bytes:Buffer.from(bytes),mime});}
 async get(key:string){keyCheck(key);const v=this.items.get(key);if(!v)throw new Error('ASSET_MISSING');return{bytes:Buffer.from(v.bytes),mime:v.mime};}
 async delete(key:string){keyCheck(key);this.items.delete(key);}
}

/**
 * Local JSON+base64 storage kept for compatibility with already-written
 * development assets. Videos are capped at 50 MB; production should replace
 * this with object storage (multipart/Range support belongs there).
 */
export class LocalStorage implements PrivateStorage{
 private root:string;constructor(root:string){this.root=resolve(root);}
 async put(key:string,bytes:Buffer,mime:string){keyCheck(key);validateMedia(bytes,mime);await mkdir(this.root,{recursive:true,mode:0o700});await writeFile(join(this.root,key),JSON.stringify({mime,data:bytes.toString('base64')}),{mode:0o600,flag:'wx'});}
 async get(key:string){keyCheck(key);const v=JSON.parse(await readFile(join(this.root,key),'utf8')) as {mime:string;data:string};const bytes=Buffer.from(v.data,'base64');validateMedia(bytes,v.mime);return{bytes,mime:v.mime};}
 async delete(key:string){keyCheck(key);await unlink(join(this.root,key)).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;});}
}

async function readCapped(response:Response,max:number,errorPrefix:string):Promise<Buffer>{
 const declared=Number(response.headers.get('content-length')??0);
 if(Number.isFinite(declared)&&declared>max)throw new Error(`${errorPrefix}_TOO_LARGE`);
 const reader=response.body?.getReader();if(!reader)throw new Error(`${errorPrefix}_EMPTY`);
 let length=0;const chunks:Buffer[]=[];
 try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>max){await reader.cancel().catch(()=>undefined);throw new Error(`${errorPrefix}_TOO_LARGE`);}chunks.push(Buffer.from(next.value));}}finally{await reader.cancel().catch(()=>undefined);}
 if(length===0)throw new Error(`${errorPrefix}_EMPTY`);
 return Buffer.concat(chunks);
}

export async function downloadImage(url:string,fetcher:typeof fetch=fetch):Promise<StoredMedia>{
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!['fal.media','v3.fal.media','v3b.fal.media'].includes(parsed.hostname))throw new Error('UNTRUSTED_IMAGE_URL');
 const response=await fetcher(parsed,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok||response.status>=300)throw new Error('IMAGE_DOWNLOAD_FAILED');
 const mime=response.headers.get('content-type')?.split(';')[0].trim()??'';
 const bytes=await readCapped(response,MAX_IMAGE_BYTES,'IMAGE');
 validateImage(bytes,mime);return{bytes,mime};
}

/**
 * Downloads a provider video from a curated HTTPS host list. fal's video
 * output can live on fal.media or the `falserverless` area of Google Cloud
 * Storage; both are exact-host/path constrained. Redirects are refused.
 */
export async function downloadVideo(url:string,fetcher:typeof fetch=fetch):Promise<StoredMedia>{
 const parsed=new URL(url);
 const falHost=['fal.media','v3.fal.media','v3b.fal.media'].includes(parsed.hostname);
 const gcsFalserverless=parsed.hostname==='storage.googleapis.com'&&parsed.pathname.startsWith('/falserverless/');
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!(falHost||gcsFalserverless))throw new Error('UNTRUSTED_VIDEO_URL');
 const response=await fetcher(parsed,{redirect:'error',signal:AbortSignal.timeout(120000)});
 if(!response.ok||response.status>=300)throw new Error('VIDEO_DOWNLOAD_FAILED');
 const mime=response.headers.get('content-type')?.split(';')[0].trim()??'video/mp4';
 const bytes=await readCapped(response,MAX_VIDEO_BYTES,'VIDEO');
 validateVideo(bytes,mime);return{bytes,mime:'video/mp4'};
}
