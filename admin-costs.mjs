import {prepareCosts} from './netsuite-costs.mjs';
export function initCosts(session){
 const $=id=>document.getElementById(id);let prepared=null,base=null,busy=false;
 const clear=()=>{prepared=null;base=null;$('costApply').disabled=true;$('costApprove').checked=false;};
 const status=t=>{$('costStatus').textContent=t;};
 for(const id of ['costFile','costDate','costBasisConfirmed'])$(id).addEventListener('change',()=>{clear();status('Review the export again after changing its inputs.');});
 $('costApprove').addEventListener('change',()=>{$('costApply').disabled=busy||!prepared||!$('costApprove').checked;});
 $('costReview').addEventListener('click',async()=>{
  if(busy)return;clear();busy=true;session.setBusy(true);$('costReview').disabled=true;
  try{
   const repo=session.repository();if(!repo)throw Error('Sign in before reviewing costs.');
   const file=$('costFile').files[0];if(!file||!file.name.toLowerCase().endsWith('.csv')||file.size>500000)throw Error('Select a NetSuite CSV export no larger than 500 KB.');
   base=await repo.read();prepared=prepareCosts(base.data,{kind:'netsuite-costs',date:$('costDate').value,csvText:await file.text(),currency:'USD',unit:'Each',confirmedFullExport:$('costBasisConfirmed').checked});
   $('costRows').replaceChildren();
   for(const b of prepared.bands){const tr=document.createElement('tr');for(const val of [b.sku,b.region,`${b.quantityMin}–${b.quantityMax}`,b.costPrice.toFixed(4),b.sourceDate]){const td=document.createElement('td');td.textContent=val;tr.append(td);}$('costRows').append(tr);}
   status(prepared.coverage.map(c=>`${c.region}: ${c.matched.length} active cards matched. Missing: ${c.missing.join(', ')||'none'}.`).join('\n')+' All regions use NetSuite-only costs. Missing costs and margins are unavailable. Historical costs cannot fill gaps.');
  }catch(e){clear();status(e.message);}finally{busy=false;session.setBusy(false);$('costReview').disabled=false;}
 });
 $('costApply').addEventListener('click',async()=>{
  if(busy||!prepared||!base||!$('costApprove').checked)return;
  busy=true;session.setBusy(true);$('costApply').disabled=true;$('costReview').disabled=true;
  try{const data=prepared.data;const result=await session.repository().publish(base,data,'NetSuite supplier costs',prepared.operation);session.saved({...result,data});clear();status('Costs saved. Check Publication status and verify the deployed calculator.');}
  catch(e){clear();status(e.message);}finally{busy=false;session.setBusy(false);$('costReview').disabled=false;}
 });
 return {invalidate:clear};
}
