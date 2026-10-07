import {AdminService} from './admin-service.mjs?v=20261007-signin';
import {initNetSuite} from './admin-netsuite.mjs?v=20261007-direct';
import {initCards} from './admin-cards.mjs?v=20261007-email';
import {readPricingFiles,prepareSellingUpdate} from './pricing-files.mjs?v=20261005-sheet';
import {initEditor} from './admin-editor.mjs?v=20261007-email';
const $=id=>document.getElementById(id);
let repository=null,snapshot=null,preview=null,busy=false,editor=null,cardManager=null,netSuite=null;
const message=(text,error=false)=>{$('message').textContent=text;$('message').className='admin-message'+(error?' error':'');};
function invalidate(){netSuite?.invalidate();preview=null;$('previewPanel').hidden=true;$('confirmPublish').checked=false;$('publishButton').disabled=true;}
function sourceControls(){const direct=(snapshot?.data||window.PRICING_DATA)?.priceSource==='netsuite';document.body?.classList?.toggle('netsuite-only',direct);}
function controls(){sourceControls();editor?.setBusy(busy);cardManager?.setBusy(busy);for(const id of ['zipFile','gateLogout','gateLogin'])$(id).disabled=busy;$('validateButton').disabled=busy;$('publishButton').disabled=busy||!snapshot||!preview||!$('confirmPublish').checked;}
function disconnect(preserveDraft=false){if(!preserveDraft){editor?.stop();cardManager?.stop();}repository?.clear();repository=null;snapshot=null;invalidate();$('connectionStatus').textContent='Signed out. Sign in with your approved email to administer pricing.';if(!preserveDraft)editor?.reload();controls();}
$('zipFile').addEventListener('change',()=>{invalidate();message('');});
$('confirmPublish').addEventListener('change',controls);
$('uploadForm').addEventListener('submit',async event=>{event.preventDefault();if(busy||!editor?.discard()||!cardManager?.discard())return;invalidate();busy=true;controls();try{const incoming=await readPricingFiles($('zipFile').files);const current=snapshot?.data||window.PRICING_DATA;if(!current)throw new Error('Pricing data is unavailable. Reload and sign in again.');preview=prepareSellingUpdate(incoming,current);$('previewCounts').replaceChildren();for(const [count,label] of [[preview.products.length,'products'],[preview.sellingRecords,'selling records']]){const box=document.createElement('div');box.className='count';const number=document.createElement('strong');number.textContent=count;const text=document.createElement('span');text.textContent=label;box.append(number,text);$('previewCounts').append(box);}$('publishHint').textContent=snapshot?'Both pricing files are published together. The website updates after GitHub Pages finishes deploying.':'Sign in and validate again to publish. This preview does not change website pricing.';$('previewSummary').textContent=`${preview.products.length} products · ${preview.sellingRecords} price-type rows. Updates entered selling prices for included SKUs only; existing costs are retained.`;$('warnings').replaceChildren();for(const text of [...preview.warnings,...(preview.removedProducts.length?[`Products removed: ${preview.removedProducts.join(', ')}`]:[])]){const li=document.createElement('li');li.textContent=text;$('warnings').append(li);}$('previewRows').replaceChildren();for(const row of preview.previewRows.slice(0,5)){const tr=document.createElement('tr');for(const text of [row.sku,row.tier,row.quantityLabel,row.sellingPrice.toFixed(4),Number.isFinite(row.costPrice)?row.costPrice.toFixed(4):'Unavailable',Number.isFinite(row.marginPercent)?`${(row.marginPercent*100).toFixed(1)}%`:'Unavailable']){const td=document.createElement('td');td.textContent=text;tr.append(td);}$('previewRows').append(tr);}$('previewPanel').hidden=false;message('Pricing files validated. Review and confirm before publishing.');}catch(error){invalidate();message(error.message,true);}finally{busy=false;controls();}});
$('publishButton').addEventListener('click',async()=>{if(busy||!snapshot||!preview||!$('confirmPublish').checked)return;busy=true;controls();try{const result=await repository.publish(snapshot,preview.data,'Apply reviewed upload',preview.operation);session.saved({...result,data:preview.data});message(`Pricing committed successfully (${result.sha.slice(0,7)}). The live site will update when GitHub Pages finishes deploying. Check deployment status below before relying on the new prices.`);}catch(error){invalidate();message(error.message,true);}finally{busy=false;controls();}});
function lock(){disconnect();$('adminPortal').hidden=true;$('adminGate').hidden=false;}
window.addEventListener('pagehide',lock);
window.addEventListener('pageshow',event=>{if(event.persisted)lock();});

const session={connect:()=>{$('adminGate').hidden=false;$('adminPortal').hidden=true;},data:()=>snapshot?.data||window.PRICING_DATA,snapshot:()=>snapshot,repository:()=>repository,setBusy:value=>{busy=value;controls();},saved:value=>{snapshot=value;window.PRICING_DATA=value.data;invalidate();$('connectionStatus').textContent=`Signed in · main ${value.sha.slice(0,7)}`;cardManager?.reload();}};
sourceControls();
editor=initEditor(session);
cardManager=initCards({...session,beforeOpen:()=>editor.discard(),saved:value=>{session.saved(value);editor.reload();}});

netSuite=initNetSuite({...session,discard:()=>editor.discard()&&cardManager.discard()});

{
 $('deploymentPanel').hidden=false;
 $('refreshDeployment').onclick=async()=>{
  if(!repository)return;
  $('refreshDeployment').disabled=true;$('deploymentStatus').textContent='Checking publication status…';
  try{
   const {runs}=await repository.status();$('deploymentRuns').replaceChildren();
   for(const run of runs.slice(0,10)){const item=document.createElement('li');item.textContent=`${run.title} · ${run.conclusion||run.status} · ${run.sha.slice(0,7)} · ${run.createdAt}`;$('deploymentRuns').append(item);}
   $('deploymentStatus').textContent='Workflow status checked. A successful deployment can then be verified against the live calculator.';
  }catch(error){$('deploymentStatus').textContent=error.message;}
  finally{$('refreshDeployment').disabled=false;}
 };
 $('gateOpen').onclick=()=>repository?.focusLogin();
 $('gateCancel').onclick=()=>repository?.cancelLogin();
 $('gateForm').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;controls();$('gateError').textContent='';$('gatePending').hidden=false;
  try{
   repository?.clear();repository=new AdminService(window.ADMIN_BACKEND_URL);
   const identity=await repository.login();snapshot=await repository.read();
   editor.connected();cardManager.connected();$('adminGate').hidden=true;$('adminPortal').hidden=false;
   $('connectionStatus').textContent=`Signed in as ${identity.email} · main ${snapshot.sha.slice(0,7)}`;
  }catch(error){repository?.clear();repository=null;snapshot=null;$('gateError').textContent=error.message;}
  finally{busy=false;controls();$('gatePending').hidden=true;}
 };
 $('gateLogout').onclick=async()=>{
  if(busy)return;
  try{await repository?.logout();disconnect();$('adminPortal').hidden=true;$('adminGate').hidden=false;$('gateError').textContent='Signed out.';}
  catch(error){message(error.message,true);}
 };
}
