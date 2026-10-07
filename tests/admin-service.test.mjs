import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BRIDGE_JS} from '../backend/bridge.mjs';
import {AdminService} from '../admin-service.mjs';
const listeners=new Set(),outbound=[];let openedUrl;
const popup={closed:false,postMessage(data,origin){outbound.push({data,origin});},close(){this.closed=true;}};
globalThis.window={addEventListener(type,fn){listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);},open(url){openedUrl=url;popup.closed=false;return popup;}};
const service=new AdminService('https://emea-cards-admin.example.workers.dev');
const emit=(data,{origin=service.origin,source=popup}={})=>{for(const fn of listeners)fn({origin,source,data:{channel:service.channel,...data}});};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const login=service.login();assert.equal(new URL(openedUrl).searchParams.get('channel'),service.channel);assert.equal(new URL(openedUrl).hash,'');emit({type:'ready'});await tick();
let request=outbound.at(-1).data;assert.equal(request.path,'/api/session');
let resolved=false;login.then(()=>resolved=true);
emit({type:'response',id:request.id,ok:true,data:{email:'attacker'}},{origin:'https://evil.test'});await tick();assert.equal(resolved,false);
emit({type:'response',id:request.id,ok:true,data:{email:'attacker'}},{source:{}});await tick();assert.equal(resolved,false);
emit({type:'response',id:request.id,ok:true,data:{email:'admin@example.test'}});assert.equal((await login).email,'admin@example.test');
const operation={kind:'upload',rows:[],date:'2026-10-06'};
const publishing=service.publish({sha:'abc'},{rows:[]},'ignored',operation);request=outbound.at(-1).data;
assert.equal(request.path,'/api/apply');assert.equal(request.body.confirmed,true);assert.deepEqual(request.body.operation,operation);assert.equal(request.body.baseSha,'abc');
emit({type:'response',id:request.id,ok:true,data:{sha:'def'}});assert.equal((await publishing).sha,'def');
const logout=service.logout();assert.equal(outbound.at(-1).data.type,'logout');emit({type:'logged-out'});await logout;
assert.equal(popup.closed,true);assert.equal(listeners.size,0);await assert.rejects(()=>service.read(),/closed/);
console.log('Admin service tests passed: popup login, origin/source checks, operation submission, confirmed logout and closed-session rejection.');

// Access may remove fragments during the email-code POST; query preserves the channel.
for(const search of ['?channel='+service.channel,'?channel=invalid']){
 const sent=[],status={textContent:''};const opener={postMessage:(data,origin)=>sent.push({data,origin})};
 vm.runInNewContext(BRIDGE_JS,{URLSearchParams,location:{search,hash:''},window:{opener,addEventListener(){}},document:{getElementById:id=>id==='status'?status:{}},Set});
 assert.equal(sent.length,search.includes('invalid')?0:1);
 if(sent.length){assert.equal(sent[0].data.channel,service.channel);assert.equal(sent[0].origin,'https://zix-b.github.io');}
}

// Logout follows no cross-origin redirect and reports success only after session denial.
for(const sessionResponse of [{type:'opaqueredirect',status:0},{type:'basic',status:200}]){
 const sent=[],nodes={status:{textContent:''},logout:{}};let calls=0;
 vm.runInNewContext(BRIDGE_JS,{URLSearchParams,location:{search:'?channel='+service.channel,hash:''},window:{opener:{postMessage:data=>sent.push(data)},addEventListener(){}},document:{getElementById:id=>nodes[id]},Set,fetch:async(path,options)=>{assert.equal(options.redirect,'manual');calls++;return path.includes('logout')?{type:'opaqueredirect',ok:false}:sessionResponse;}});
 await nodes.logout.onclick();assert.equal(calls,2);assert.equal(sent.at(-1).type,sessionResponse.status===200?'logout-failed':'logged-out');
}

// Closing/cancelling a popup must settle login instead of leaving the gate disabled.
const closedService=new AdminService('https://emea-cards-admin.example.workers.dev');
const closedLogin=closedService.login();popup.closed=true;
await assert.rejects(closedLogin,/window was closed/);closedService.clear();
const cancelledService=new AdminService('https://emea-cards-admin.example.workers.dev');
const cancelledLogin=cancelledService.login();cancelledService.cancelLogin();
await assert.rejects(cancelledLogin,/cancelled/);cancelledService.clear();
const originalOpen=window.open;window.open=()=>null;
const blockedService=new AdminService('https://emea-cards-admin.example.workers.dev');
await assert.rejects(blockedService.login(),/Allow the sign-in popup/);window.open=originalOpen;
assert.equal(listeners.size,0);
console.log('Sign-in recovery passed: closed popup, cancellation, blocked popup, timer/listener cleanup.');
