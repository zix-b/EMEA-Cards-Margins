const ROOT='https://api.github.com/repos/zix-b/EMEA-Cards-Margins';
export class Repository {
 constructor(token,transport=fetch){this.token=token;this.transport=transport;}
 clear(){this.token='';}
 async api(path,{method='GET',body}={}){
  if(!this.token)throw new Error('Connect to GitHub first.');
  const response=await this.transport(ROOT+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.token}`,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error'});
  if(!response.ok){if(response.status===401)throw new Error('GitHub token is invalid or expired.');if(response.status===403)throw new Error('GitHub denied access. Use a repository-scoped token with Contents: Read and write.');if(response.status===409||response.status===422)throw new Error('The repository changed or branch protection blocked the update. Reconnect and validate again.');throw new Error(`GitHub request failed (${response.status}). Current publication status may need checking in GitHub.`);}
  return response.status===204?null:response.json();
 }
 async read(){
  const repo=await this.api('');if(repo.permissions?.push!==true)throw new Error('This GitHub account cannot update this repository.');if(repo.default_branch!=='main')throw new Error('The default branch changed. Review the deployment configuration first.');
  const ref=await this.api('/git/ref/heads/main'),commit=await this.api(`/git/commits/${ref.object.sha}`),file=await this.api(`/contents/pricing-data.json?ref=${ref.object.sha}`);
  if(file.encoding!=='base64'||!file.content)throw new Error('Unable to read repository pricing.');
  const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
  if(!Array.isArray(data.rows)||!Array.isArray(data.costBands))throw new Error('Repository pricing format is unsupported.');
  return {sha:ref.object.sha,tree:commit.tree.sha,data};
 }
 async publish(snapshot,data,message='Update pricing through the admin ZIP portal'){
  const ref=await this.api('/git/ref/heads/main');if(ref.object.sha!==snapshot.sha)throw new Error('The repository changed since preview. Reconnect and validate again.');
  const json=JSON.stringify(data,null,2)+'\n';
  const entries=[];
  for(const [path,content] of [['pricing-data.json',json],['pricing-data.js',`window.PRICING_DATA = ${json.trim()};\n`]]){
   const blob=await this.api('/git/blobs',{method:'POST',body:{content,encoding:'utf-8'}});entries.push({path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const tree=await this.api('/git/trees',{method:'POST',body:{base_tree:snapshot.tree,tree:entries}});
  const commit=await this.api('/git/commits',{method:'POST',body:{message,tree:tree.sha,parents:[snapshot.sha]}});
  // Non-force update rejects a concurrent edit; both pricing files move together.
  try{await this.api('/git/refs/heads/main',{method:'PATCH',body:{sha:commit.sha,force:false}});}catch(error){throw new Error(`${error.message} Check GitHub for commit ${commit.sha} before retrying.`);}
  return {sha:commit.sha,tree:tree.sha,url:`https://github.com/zix-b/EMEA-Cards-Margins/commit/${commit.sha}`};
 }
}
