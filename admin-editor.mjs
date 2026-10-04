import {cards,createMatrix,prepareEditorUpdate,QUANTITIES,rangeLabel,tierLabel} from './pricing-editor.mjs';
export function initEditor(session){
 const $=id=>document.getElementById(id);
 let editing=false,isNew=false,matrix=null,draftSnapshot=null,prepared=null,busy=false,poll=0;
 const status=(text,error=false)=>{$('editorStatus').textContent=text;$('editorStatus').className=error?'error':'muted';};
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 function sync(){
  const connected=Boolean(session.snapshot());
  for(const id of ['editorCard','editorAdd','editorEdit','editorCancel','editorSave','editorConfirm','editorBack','editorSku','editorProduct','editorCost','editorBasis'])$(id).disabled=busy;
  $('editorCard').disabled=busy||editing;$('editorAdd').disabled=busy||editing||!connected;$('editorEdit').disabled=busy||editing||!connected||!$('editorCard').value;
  $('editorSave').disabled=busy||!connected;$('editorFields').hidden=!isNew;
  $('editorActions').hidden=!editing;$('editorEdit').hidden=editing;
  $('editorConnectionNote').hidden=connected;
  for(const input of $('editorRows').querySelectorAll('input'))input.disabled=busy||Boolean(prepared);
 }
 function draw(){
  $('editorRows').replaceChildren();
  for(const row of matrix||[]){
   const tr=node('tr'),th=node('th',tierLabel(row.tier));th.scope='row';tr.append(th);
   row.cells.forEach((cell,col)=>{
    const td=node('td');
    for(const segment of cell){
     const label=node('label');label.className='editor-cell';
     label.append(node('span',rangeLabel(segment.min,segment.max)));
     if(editing){const input=node('input');input.type='number';input.min='0';input.step='any';input.value=segment.value;input.placeholder='Not set';input.setAttribute('aria-label',`${tierLabel(row.tier)}, ${rangeLabel(segment.min,segment.max)} units`);input.addEventListener('input',()=>{segment.value=input.value;prepared=null;$('editorConfirmation').hidden=true;sync();});label.append(input);}
     else label.append(node('strong',segment.original===null?'—':String(segment.original)));
     td.append(label);
    }
    tr.append(td);
   });
   $('editorRows').append(tr);
  }
  sync();
 }
 function load(){
  poll++;
  editing=false;isNew=false;prepared=null;draftSnapshot=null;
  $('editorConfirmation').hidden=true;
  try{const data=session.data();matrix=$('editorCard').value?createMatrix(data,$('editorCard').value):null;const card=cards(data).find(c=>c.sku===$('editorCard').value);$('editorCardName').textContent=card?`${card.sku} · ${card.product}`:'Choose a card';status('Existing selling bands and supplier costs are preserved.');draw();}catch(error){matrix=null;draw();status(error.message,true);}
 }
 function reload(){
  const selected=$('editorCard').value;$('editorCard').replaceChildren();
  for(const card of cards(session.data())){const option=node('option',`${card.sku} · ${card.product}`);option.value=card.sku;$('editorCard').append(option);}
  if(cards(session.data()).some(c=>c.sku===selected))$('editorCard').value=selected;
  load();
 }
 function begin(add){
  if(!session.snapshot()||busy)return;
  poll++;isNew=add;editing=true;prepared=null;draftSnapshot=session.snapshot();
  matrix=createMatrix(draftSnapshot.data,add?'':$('editorCard').value,add);
  $('editorConfirmation').hidden=true;
  for(const id of ['editorSku','editorProduct','editorCost','editorBasis'])$(id).value='';
  if(add)$('editorCardName').textContent='New card';
  status(add?'Enter all 32 selling prices and one fixed unit cost.':'Edit selling prices. Blank, previously missing bands may stay blank. Existing prices cannot be cleared.');draw();
  if(add)$('editorSku').focus();
 }
 function review(){
  try{
   const card=cards(draftSnapshot.data).find(c=>c.sku===$('editorCard').value);
   prepared=prepareEditorUpdate(draftSnapshot.data,{sku:isNew?$('editorSku').value:card.sku,product:isNew?$('editorProduct').value:card.product,matrix,isNew,costPrice:$('editorCost').value,costBasis:$('editorBasis').value});
   $('editorChanges').replaceChildren();
   for(const change of prepared.changes){const li=node('li',`${tierLabel(change.tier)} · ${rangeLabel(change.min,change.max)}: ${change.before===null?'not set':change.before} → ${change.after} USD`);$('editorChanges').append(li);}
   $('editorConfirmText').textContent=`Save ${prepared.changes.length} price change${prepared.changes.length===1?'':'s'} for ${prepared.sku}? Only this card will change. ${isNew?'The new card gets the fixed cost you entered.':'Existing costs remain unchanged.'} Source date: ${prepared.data.generatedAt}. Previous values remain in Git history.`;
   $('editorConfirmation').hidden=false;sync();$('editorConfirm').focus();status('Review the changes, then confirm the save.');
  }catch(error){prepared=null;status(error.message,true);}
 }
 async function watchDeployment(data,sha){
  const generation=++poll;
  status(`Saved to GitHub (${sha.slice(0,7)}). Waiting for GitHub Pages to publish these prices…`);
  for(let attempt=0;attempt<24&&generation===poll;attempt++){
   try{const response=await fetch(`pricing-data.json?editorSave=${encodeURIComponent(sha)}`,{cache:'no-store'});if(response.ok&&JSON.stringify(await response.json())===JSON.stringify(data)&&generation===poll){window.PRICING_DATA=data;status('Live pricing verified. The calculator now reads these prices; already-open calculators refresh within 15 seconds or when focused.');return;}}catch{/* Keep the successful repository save separate from deployment availability. */}
   await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(generation===poll)status('Saved to GitHub. Live deployment is still pending or could not be verified. Check deployment status below; do not save again just to retry deployment.');
 }
 async function save(){
  if(busy||!prepared||!draftSnapshot)return;
  const update=prepared,base=draftSnapshot;session.setBusy(true);
  try{
   const result=await session.repository().publish(base,update.data,`Update ${update.sku} pricing through the admin editor`);
   session.saved({sha:result.sha,tree:result.tree,data:update.data});
   reload();$('editorCard').value=update.sku;load();
   $('editorSavedCommit').href=result.url;$('editorSavedCommit').textContent=`View saved version ${result.sha.slice(0,7)}`;$('editorSavedCommit').hidden=false;
   void watchDeployment(update.data,result.sha);
  }catch(error){status(`${error.message} Your draft has been kept. Check the repository before retrying if the publication status is uncertain.`,true);}
  finally{session.setBusy(false);}
 }
 $('openPriceEditor').addEventListener('click',()=>{const panel=$('priceEditor');panel.hidden=!panel.hidden;$('openPriceEditor').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden&&!editing)reload();});
 $('editorCard').addEventListener('change',load);
 $('editorEdit').addEventListener('click',()=>begin(false));$('editorAdd').addEventListener('click',()=>begin(true));
 $('editorSave').addEventListener('click',review);$('editorCancel').addEventListener('click',load);
 $('editorBack').addEventListener('click',()=>{prepared=null;$('editorConfirmation').hidden=true;sync();});
 $('editorConfirm').addEventListener('click',save);
 for(const id of ['editorSku','editorProduct','editorCost','editorBasis'])$(id).addEventListener('input',()=>{prepared=null;$('editorConfirmation').hidden=true;sync();});
 const head=node('tr');head.append(node('th','Price type / USD per unit'));for(const q of QUANTITIES)head.append(node('th',`QTY ${q.toLocaleString('en-US')}`));$('editorColumns').append(head);
 reload();
 return {reload,setBusy(value){busy=value;sync();},stop(){poll++;reload();},discard(){if(!editing)return true;if(!window.confirm('Discard unsaved price-editor changes?'))return false;load();return true;}};
}
