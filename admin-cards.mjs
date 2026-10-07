import {listCards,cardSnapshot,prepareCardUpdate} from './card-management.mjs?v=20261005-cards';
export function initCards(session){
 const $=id=>document.getElementById(id);
 let draft=null,base=null,prepared=null,busy=false,conflict=false;
 const status=(text,error=false)=>{$('cardsStatus').textContent=text;$('cardsStatus').className=error?'error':'muted';};
 function sync(){
  for(const id of ['cardsAdd','cardsClose','cardsSave','cardsCancel','cardsConfirm','cardsBack','cardSku','cardProduct'])$(id).disabled=busy;
  $('cardsSave').disabled=busy||conflict;$('cardsConfirm').disabled=busy||conflict;
  for(const button of $('cardsRows').querySelectorAll('button'))button.disabled=busy||Boolean(draft);
  $('cardsAdd').disabled=busy||Boolean(draft);
 }
 function draw(){
  $('cardsRows').replaceChildren();
  for(const card of listCards(session.data())){
   const tr=document.createElement('tr');
   for(const text of [card.sku,card.product]){const td=document.createElement('td');td.textContent=text;tr.append(td);}
   const actions=document.createElement('td');actions.className='card-row-actions';
   for(const [action,label] of [['edit','Edit'],['delete','Delete']]){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=label;button.setAttribute('aria-label',`${label} ${card.sku}`);button.addEventListener('click',()=>begin(action,card));actions.append(button);}
   tr.append(actions);$('cardsRows').append(tr);
  }
  $('cardsEmpty').hidden=listCards(session.data()).length>0;sync();
 }
 function reset(){draft=null;base=null;prepared=null;conflict=false;$('cardDetails').hidden=true;$('cardsConfirmation').hidden=true;draw();}
 function discard(){
  if(busy)return false;
  if(draft&&!window.confirm('Discard unsaved card changes?'))return false;
  reset();return true;
 }
 function begin(action,card){
  if(busy)return;
  base=session.snapshot()||{sha:null,data:JSON.parse(JSON.stringify(session.data()))};
  draft={action,originalSku:card?.sku};prepared=null;conflict=false;
  $('cardSku').value=card?.sku||'';$('cardProduct').value=card?.product||'';
  $('cardDetailsTitle').textContent=action==='add'?'Add New Card':'Edit Card';
  $('cardDetails').hidden=action==='delete';$('cardsConfirmation').hidden=true;
  status(action==='add'?'Enter the card details. Add selling prices separately in Manage Pricing or by ZIP upload.':'');sync();
  if(action==='delete')review();else $('cardSku').focus();
 }
 function request(){return {...draft,sku:$('cardSku').value,product:$('cardProduct').value};}
 function review(){
  if(!draft)return;
  try{
   if(conflict)throw new Error('This card changed in GitHub. Cancel and reopen it before saving.');
   prepared=prepareCardUpdate(base.data,request());
   const {action,sku,product}=prepared;
   $('cardsConfirmText').textContent=action==='delete'?`Delete ${sku} · ${product}? This removes the card and all its selling-price and cost records from the website. Other cards stay unchanged. The previous version remains in Git history.`:action==='add'?`Add ${sku} · ${product}? No selling prices or costs will be assumed.`:`Save ${sku} · ${product}? Existing selling prices, quantity bands and costs will be preserved.`;
   $('cardsConfirm').textContent=action==='delete'?'Confirm delete':'Confirm save';
   $('cardsConfirmation').hidden=false;sync();$('cardsConfirm').focus();
  }catch(error){prepared=null;$('cardsConfirmation').hidden=true;status(error.message,true);}
 }
 async function save(){
  if(busy||!prepared||conflict)return;
  if(!session.snapshot()){status('Connect GitHub to save this change. Your card details will be kept.');session.connect();return;}
  session.setBusy(true);
  try{
   const update=prepared,result=await session.repository().publish(base,update.data,`${update.action==='delete'?'Delete':update.action==='add'?'Add':'Edit'} ${update.sku} through Manage Cards`,update.operation);
   session.saved({sha:result.sha,tree:result.tree,data:update.data});
   reset();status(`Card ${update.action==='delete'?'deleted':update.action==='add'?'added':'updated'} in GitHub. The live website updates after GitHub Pages finishes deploying.`);
  }catch(error){status(`${error.message} Your changes have been kept.`,true);}
  finally{session.setBusy(false);}
 }
 $('editorAdd').addEventListener('click',()=>{
  if(busy)return;
  if(!$('cardsPanel').hidden){if(!discard())return;$('cardsPanel').hidden=true;$('pricingEditorContent').hidden=false;$('editorAdd').setAttribute('aria-expanded','false');return;}
  if(!session.beforeOpen())return;reset();status('');$('cardsPanel').hidden=false;$('pricingEditorContent').hidden=true;$('editorAdd').setAttribute('aria-expanded','true');
 });
 $('cardsClose').addEventListener('click',()=>{if(!discard())return;$('cardsPanel').hidden=true;$('pricingEditorContent').hidden=false;$('editorAdd').setAttribute('aria-expanded','false');$('editorAdd').focus();});
 $('cardsAdd').addEventListener('click',()=>begin('add'));
 $('cardsSave').addEventListener('click',review);$('cardsCancel').addEventListener('click',()=>{reset();status('');});
 $('cardsConfirm').addEventListener('click',save);
 $('cardsBack').addEventListener('click',()=>{if(draft?.action==='delete'){reset();status('Deletion cancelled.');}else{prepared=null;$('cardsConfirmation').hidden=true;sync();}});
 for(const id of ['cardSku','cardProduct'])$(id).addEventListener('input',()=>{prepared=null;$('cardsConfirmation').hidden=true;sync();});
 draw();
 return {setBusy(value){busy=value;sync();},discard,reload(){if(!draft)draw();},stop(){reset();$('cardsPanel').hidden=true;$('pricingEditorContent').hidden=false;$('editorAdd').setAttribute('aria-expanded','false');},connected(){
  if(!draft){draw();return;}
  try{
   const latest=session.snapshot(),sku=draft.action==='add'?$('cardSku').value.trim():draft.originalSku;
   if(cardSnapshot(base.data,sku)!==cardSnapshot(latest.data,sku))throw new Error('This card changed in GitHub. Cancel and reopen it before saving.');
   base=latest;prepared=null;conflict=false;$('cardsConfirmation').hidden=true;status('Connected. Review and confirm your card change again.');
   if(draft.action==='delete')review();
  }catch(error){conflict=true;prepared=null;$('cardsConfirmation').hidden=true;status(error.message,true);}
  sync();
 }};
}
