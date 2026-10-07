// Authenticated popup: cookies stay first-party on the Worker and never enter Pages.
export const BRIDGE_JS = `
const parentOrigin='https://zix-b.github.io';
// Query parameters survive Access's email POST redirect; fragments can be lost.
const channel=new URLSearchParams(location.search).get('channel')||location.hash.slice(1);
const parentWindow=window.opener;
const status=document.getElementById('status');
const allowed=new Set(['GET /api/session','GET /api/pricing','GET /api/netsuite','GET /api/status','POST /api/apply','POST /api/sync']);
let active=true;
const send=value=>parentWindow?.postMessage({channel,...value},parentOrigin);
async function logout(){
 active=false;
 try {
  const response=await fetch('/cdn-cgi/access/logout',{credentials:'same-origin',cache:'no-store',redirect:'manual'});
  if(!response.ok&&response.type!=='opaqueredirect')throw Error();
  const session=await fetch('/api/session',{credentials:'same-origin',cache:'no-store',redirect:'manual',headers:{'X-Admin-Request':'1'}});
  if(session.type!=='opaqueredirect'&&session.status!==401)throw Error();
  send({type:'logged-out'}); status.textContent='Signed out. You can close this window.';
 } catch {send({type:'logout-failed'});status.textContent='Sign-out could not be confirmed. Use the sign-out link below.';}
}
document.getElementById('logout').onclick=logout;
window.addEventListener('message',async event=>{
 if(!active||!parentWindow||event.source!==parentWindow||event.origin!==parentOrigin||event.data?.channel!==channel)return;
 const {id,method,path,body,type}=event.data;
 if(type==='logout'){await logout();return;}
 if(type!=='request'||typeof id!=='string'||!allowed.has(method+' '+path))return;
 try{
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-Admin-Request':'1',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const data=await response.json();send({type:'response',id,ok:response.ok,data});
 }catch{send({type:'response',id,ok:false,data:{error:'Session or network unavailable. Sign in again and check saved status before retrying.'}});}
});
if(!parentWindow||!/^[a-f0-9-]{36}$/.test(channel)){active=false;status.textContent='Open sign-in from the pricing admin page.';}
else{send({type:'ready'});status.textContent='Signed in. Return to the pricing admin tab. Keep this window open while administering prices.';}
`;
export const BRIDGE_HTML='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EMEA pricing admin sign-in</title><h1>Pricing admin sign-in</h1><p id="status">Verifying session…</p><button id="logout">Log out</button><p><a href="/cdn-cgi/access/logout">Complete Cloudflare sign-out</a></p><script src="/bridge.js"></script></html>';
