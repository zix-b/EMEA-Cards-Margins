// Cloudflare Access uses a first-party popup so browsers need no third-party cookies.
export class AdminService {
 constructor(url){
  this.origin=new URL(url).origin;
  if(!/^https:\/\/emea-cards-admin\.[a-z0-9-]+\.workers\.dev$/.test(this.origin))throw Error('Invalid admin service address.');
  this.channel=crypto.randomUUID();this.pending=new Map();this.popup=null;
  this.listener=event=>{
   if(event.origin!==this.origin||event.source!==this.popup||event.data?.channel!==this.channel)return;
   const data=event.data;
   if(data.type==='ready'){this.readyResolve?.();return;}
   if(data.type==='logged-out'){this.logoutResolve?.();return;}
   if(data.type==='logout-failed'){this.logoutReject?.(Error('Cloudflare sign-out could not be confirmed. Complete sign-out in the sign-in window.'));return;}
   const pending=this.pending.get(data.id);if(!pending||data.type!=='response')return;
   clearTimeout(pending.timer);this.pending.delete(data.id);
   if(data.ok)pending.resolve(data.data);else pending.reject(Error(data.data?.error||'Admin request failed.'));
  };
  window.addEventListener('message',this.listener);
 }
 async login(){
  const ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
  this.popup=window.open(this.origin+'/bridge?channel='+this.channel,'emea-admin-'+this.channel,'popup,width=560,height=680');
  if(!this.popup){this.clear();throw Error('Allow the sign-in popup, then try again.');}
  const timer=setTimeout(()=>this.readyReject?.(Error('Sign-in timed out. Try again.')),600000);
  const closed=setInterval(()=>{if(this.popup?.closed)this.readyReject?.(Error('The sign-in window was closed. Click Sign in with email to reopen it.'));},250);
  try{await ready;return await this.request('/api/session');}finally{clearTimeout(timer);clearInterval(closed);this.readyResolve=null;this.readyReject=null;}
 }
 focusLogin(){this.popup?.focus();}
 cancelLogin(){this.readyReject?.(Error('Sign-in cancelled. You can try again.'));}
 request(path,{method='GET',body}={}){
  if(!this.popup||this.popup.closed)return Promise.reject(Error('The sign-in window is closed. Log in again.'));
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Request timed out. Check saved status before retrying.'));},60000);
   this.pending.set(id,{resolve,reject,timer});
   this.popup.postMessage({type:'request',channel:this.channel,id,path,method,body},this.origin);
  });
 }
 read(){return this.request('/api/pricing');}
 preview(){return this.request('/api/netsuite');}
 sync(requestId){return this.request('/api/sync',{method:'POST',body:{requestId,approvePublicPreview:true}});}
 status(){return this.request('/api/status');}
 publish(snapshot,data,message,operation){
  if(!operation)throw Error('Review this change again before applying.');
  return this.request('/api/apply',{method:'POST',body:{baseSha:snapshot.sha,confirmed:true,operation,expectedData:data}});
 }
 async logout(){
  if(!this.popup||this.popup.closed)throw Error('Reopen sign-in and complete Cloudflare logout to end the server session.');
  const done=new Promise((resolve,reject)=>{this.logoutResolve=resolve;this.logoutReject=reject;});
  const timer=setTimeout(()=>this.logoutReject?.(Error('Sign-out could not be confirmed. Complete sign-out in the sign-in window.')),15000);
  this.popup.postMessage({type:'logout',channel:this.channel},this.origin);
  try{await done;this.clear();}finally{clearTimeout(timer);this.logoutResolve=null;this.logoutReject=null;}
 }
 clear(){
  window.removeEventListener('message',this.listener);
  for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(Error('Admin session closed.'));}this.pending.clear();
  this.popup?.close();this.popup=null;
 }
}
