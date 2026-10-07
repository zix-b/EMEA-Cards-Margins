const ROOT='https://api.github.com/repos/zix-b/EMEA-Cards-Margins';
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export class PrivateRepository {
 constructor(token,transport=(url,init)=>fetch(url,init)){this.token=token;this.transport=transport;}
 async api(path,{method='GET',body=null}={}) {
  if(!this.token)throw new HttpError(503,'Private repository authorization is not configured.');
  const response=await this.transport(ROOT+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'EMEA-Cards-Admin',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual'});
  if(!response.ok)throw new HttpError(response.status===409||response.status===422?409:502, response.status===409||response.status===422?'The repository changed. Reload and review again.':`Repository service failed (${response.status}). No credentials were returned. Check saved status before retrying.`);
  return response.status===204?null:response.json();
 }
 async file(path,sha){
  const f=await this.api(`/contents/${path}?ref=${sha}`);
  if(f.encoding!=='base64'||!f.content)throw new HttpError(502,'Repository file is unavailable.');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
 }
 async read(){
  const ref=await this.api('/git/ref/heads/main'),sha=ref.object.sha;
  const [commit,data]=await Promise.all([this.api(`/git/commits/${sha}`),this.file('pricing-data.json',sha)]);
  return {sha,tree:commit.tree.sha,data};
 }
 async publish(snapshot,data,kind){
  if((await this.api('/git/ref/heads/main')).object.sha!==snapshot.sha)throw new HttpError(409,'The repository changed since review. Reload and review again.');
  // A durable Git reference preserves the exact active version before changing main.
  try{await this.api('/git/refs',{method:'POST',body:{ref:`refs/tags/pricing-backup-${snapshot.sha}`,sha:snapshot.sha}});}
  catch(error){const backup=await this.api(`/git/ref/tags/pricing-backup-${snapshot.sha}`);if(backup.object.sha!==snapshot.sha)throw error;}
  const json=JSON.stringify(data,null,2)+'\n',entries=[];
  for(const [path,content] of [['pricing-data.json',json],['pricing-data.js',`window.PRICING_DATA = ${json.trim()};\n`]]){
   const blob=await this.api('/git/blobs',{method:'POST',body:{content,encoding:'utf-8'}});entries.push({path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const tree=await this.api('/git/trees',{method:'POST',body:{base_tree:snapshot.tree,tree:entries}});
  const commit=await this.api('/git/commits',{method:'POST',body:{message:`Apply reviewed ${kind} through authenticated admin`,tree:tree.sha,parents:[snapshot.sha]}});
  try{await this.api('/git/refs/heads/main',{method:'PATCH',body:{sha:commit.sha,force:false}});}
  catch(error){throw new HttpError(error.status||502,`${error.message} Check saved status for commit ${commit.sha} before retrying.`);}
  return {sha:commit.sha,tree:tree.sha,url:`https://github.com/zix-b/EMEA-Cards-Margins/commit/${commit.sha}`,backup:snapshot.sha};
 }
 async sync(requestId){
  await this.api('/actions/workflows/netsuite-preview.yml/dispatches',{method:'POST',body:{ref:'main',inputs:{request_id:requestId,approve_public_preview:true}}});
  return {requestId};
 }
 async status(){
  const results=await Promise.all(['pages.yml','netsuite-preview.yml'].map(name=>this.api(`/actions/workflows/${name}/runs?branch=main&per_page=10`)));
  return {runs:results.flatMap(r=>r.workflow_runs.map(({id,head_sha,status,conclusion,display_title,html_url,created_at})=>({id,sha:head_sha,status,conclusion,title:display_title,url:html_url,createdAt:created_at}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};
 }
}
