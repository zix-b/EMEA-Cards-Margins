import {authenticate} from './auth.mjs';
import {PrivateRepository,HttpError} from './repository.mjs';
import {buildUpdate} from './operations.mjs';
import {BRIDGE_HTML,BRIDGE_JS} from './bridge.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
const json=(data,status=200)=>Response.json(data,{status,headers});
async function body(request){
 if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw new HttpError(415,'JSON is required.');
 const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Request body is required.');
 let size=0,parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2200000){await reader.cancel();throw new HttpError(413,'Request exceeds the supported size.');}parts.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new HttpError(400,'Invalid JSON.');}
}
export async function handle(request,env,{transport=fetch,auth=authenticate}={}){
 try{
  const url=new URL(request.url),path=url.pathname;
  // Every route fails closed until Access and the explicit allowlist are configured.
  const identity=await auth(request,env,transport);
  if(request.method==='GET'&&(path==='/'||path==='/bridge'))return new Response(BRIDGE_HTML,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  if(request.method==='GET'&&path==='/bridge.js')return new Response(BRIDGE_JS,{headers:{...headers,'Content-Type':'text/javascript; charset=utf-8'}});
  if(request.headers.get('X-Admin-Request')!=='1')throw new HttpError(403,'Use the authenticated admin portal.');
  if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)throw new HttpError(403,'Cross-origin writes are not accepted.');
  if(request.method==='GET'&&path==='/api/session')return json(identity);
  const repo=new PrivateRepository(env.GITHUB_TOKEN,transport);
  if(request.method==='GET'&&path==='/api/pricing')return json(await repo.read());
  if(request.method==='GET'&&path==='/api/netsuite'){
   const snapshot=await repo.read();return json({sha:snapshot.sha,preview:await repo.file('netsuite-preview.json',snapshot.sha)});
  }
  if(request.method==='GET'&&path==='/api/status')return json(await repo.status());
  if(request.method==='POST'&&path==='/api/sync'){
   const input=await body(request);
   if(input.approvePublicPreview!==true||!/^[-a-zA-Z0-9]{1,64}$/.test(input.requestId||''))throw new HttpError(400,'Approve the public preview and provide a request ID.');
   return json(await repo.sync(input.requestId));
  }
  if(request.method==='POST'&&path==='/api/apply'){
   const input=await body(request);
   if(input.confirmed!==true||! /^[a-f0-9]{40}$/.test(input.baseSha||''))throw new HttpError(400,'A reviewed version and confirmation are required.');
   const snapshot=await repo.read();
   if(snapshot.sha!==input.baseSha)throw new HttpError(409,'The repository changed since review. Reload and review again.');
   const preview=input.operation?.kind==='netsuite'?await repo.file('netsuite-preview.json',snapshot.sha):null;
   let data;try{data=buildUpdate(snapshot.data,input.operation,preview);}catch(error){throw new HttpError(400,error.message);}
   if(JSON.stringify(data)!==JSON.stringify(input.expectedData))throw new HttpError(409,'The server result differs from your preview. Reload and review again.');
   return json(await repo.publish(snapshot,data,input.operation.kind));
  }
  throw new HttpError(404,'Unsupported admin action.');
 }catch(error){return json({error:error instanceof HttpError?error.message:'The request could not be completed. Check saved status before retrying.'},error.status||500);}
}
export default {fetch:handle};
