import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {listCards,cardSnapshot,prepareCardUpdate} from '../card-management.mjs';
class Element{
 constructor(tag='div'){this.tag=tag;this.value='';this.hidden=false;this.disabled=false;this.children=[];this.handlers={};this.attrs={};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}addEventListener(t,f){this.handlers[t]=f;}setAttribute(k,v){this.attrs[k]=v;}focus(){}
 querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
let active=JSON.parse(fs.readFileSync('pricing-data.json','utf8')),snapshot={sha:'initial',tree:'tree',data:active},published=0,fail=false,connect=0,manager;
const ctx={listCards,cardSnapshot,prepareCardUpdate,document:{getElementById:get,createElement:t=>new Element(t)},window:{confirm:()=>true},console};
vm.runInNewContext(fs.readFileSync('admin-cards.mjs','utf8').replace(/^import .*;\n/gm,'').replace('export function initCards','function initCards')+'\nthis.init=initCards;',ctx);
manager=ctx.init({data:()=>snapshot?.data||active,snapshot:()=>snapshot,beforeOpen:()=>true,connect:()=>connect++,setBusy:b=>manager.setBusy(b),saved:s=>{snapshot=s;active=s.data;},repository:()=>({async publish(base,data){assert.equal(base.sha,snapshot.sha);published++;if(fail)throw Error('Save failed');return {sha:'saved'+published,tree:'tree',url:'https://example.invalid'};}})});
const click=id=>get(id).handlers.click();const rowAction=(sku,action)=>get('cardsRows').querySelectorAll('button').find(b=>b.attrs['aria-label']===`${action} ${sku}`).handlers.click();
get('cardsPanel').hidden=true;click('editorAdd');assert.equal(get('cardsPanel').hidden,false);assert.equal(get('pricingEditorContent').hidden,true);
click('cardsAdd');get('cardSku').value='NEW-ONE';get('cardProduct').value='New Product';click('cardsCancel');assert.equal(published,0);assert.ok(!listCards(active).some(c=>c.sku==='NEW-ONE'));
click('cardsAdd');get('cardSku').value='NEW-ONE';get('cardProduct').value='New Product';click('cardsSave');assert.equal(published,0);assert.equal(get('cardsConfirmation').hidden,false);
fail=true;await click('cardsConfirm');assert.equal(get('cardSku').value,'NEW-ONE');assert.ok(!listCards(active).some(c=>c.sku==='NEW-ONE'));fail=false;await click('cardsConfirm');assert.ok(listCards(active).some(c=>c.sku==='NEW-ONE'));
rowAction('NEW-ONE','Edit');get('cardSku').value='NEW-TWO';get('cardProduct').value='Updated Product';click('cardsSave');await click('cardsConfirm');assert.ok(listCards(active).some(c=>c.sku==='NEW-TWO'&&c.product==='Updated Product'));
rowAction('NEW-TWO','Delete');assert.match(get('cardsConfirmText').textContent,/all its selling-price and cost records/);const prior=published;click('cardsBack');assert.equal(published,prior);assert.ok(listCards(active).some(c=>c.sku==='NEW-TWO'));
rowAction('NEW-TWO','Delete');await click('cardsConfirm');assert.ok(!listCards(active).some(c=>c.sku==='NEW-TWO'));
// Offline drafts survive connecting; confirmation must be renewed after fresh data arrives.
snapshot=null;click('cardsAdd');get('cardSku').value='OFFLINE';get('cardProduct').value='Offline Draft';click('cardsSave');await click('cardsConfirm');assert.equal(connect,1);snapshot={sha:'fresh',tree:'tree',data:active};manager.setBusy(true);manager.connected();manager.setBusy(false);assert.equal(get('cardSku').value,'OFFLINE');assert.equal(get('cardsConfirmation').hidden,true);click('cardsSave');await click('cardsConfirm');assert.ok(listCards(active).some(c=>c.sku==='OFFLINE'));
snapshot=null;rowAction('OFFLINE','Delete');await click('cardsConfirm');snapshot={sha:'fresh-delete',tree:'tree',data:active};manager.setBusy(true);manager.connected();manager.setBusy(false);assert.equal(get('cardsConfirmation').hidden,false);await click('cardsConfirm');assert.ok(!listCards(active).some(c=>c.sku==='OFFLINE'));
// Prevent overwriting a card modified while the admin connects.
snapshot=null;rowAction('CTC-007','Edit');get('cardProduct').value='Draft name';snapshot={sha:'concurrent',tree:'tree',data:prepareCardUpdate(active,{action:'edit',originalSku:'CTC-007',sku:'CTC-007',product:'Remote name'}).data};manager.connected();assert.equal(get('cardsSave').disabled,true);assert.match(get('cardsStatus').textContent,/changed in GitHub/);
console.log('Manage Cards UI tests passed: list, add/edit/delete, confirmation/cancel, failed-save retention, connect-and-save and conflict protection.');
