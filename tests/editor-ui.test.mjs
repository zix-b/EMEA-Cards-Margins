import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {QUANTITY_BANDS} from '../pricing-template.mjs';
import {cards,createMatrix,prepareEditorUpdate,rebaseDraft,QUANTITIES,rangeLabel,tierLabel} from '../pricing-editor.mjs';
const data=JSON.parse(execFileSync('git',['show','c37642af474e266f9ac7a9c5db5a3a3639cbf3ea:pricing-data.json'],{encoding:'utf8'}));
class Element{
 constructor(tag='div'){this.tag=tag;this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.children=[];this.handlers={};this.attrs={};}
 append(...nodes){this.children.push(...nodes);if(this.tag==='select'&&!this.value)this.value=nodes[0]?.value||'';}
 replaceChildren(){this.children=[];if(this.tag==='select')this.value='';}
 addEventListener(type,fn){this.handlers[type]=fn;}
 setAttribute(k,v){this.attrs[k]=v;}
 focus(){}
 querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element(id==='editorCard'?'select':'div'));return elements.get(id);};
let snapshot={sha:'before',tree:'tree-before',data},published=0,failSave=false,editor,confirmDiscard=true,connectRequests=0;
const session={connect:()=>{connectRequests++;},data:()=>snapshot?.data||data,snapshot:()=>snapshot,repository:()=>({async publish(base,next,message){published++;assert.equal(base.sha,snapshot.sha);assert.match(message,/admin editor/);if(failSave)throw new Error('Synthetic save failure');return {sha:'saved',tree:'tree-saved',url:'https://example.invalid/commit'};}}),setBusy:value=>editor.setBusy(value),saved:next=>{snapshot=next;}};
const source=fs.readFileSync('admin-editor.mjs','utf8').replace(/^import .*;\n/gm,'').replace('export function initEditor','function initEditor');
const context={QUANTITY_BANDS,cards,createMatrix,prepareEditorUpdate,rebaseDraft,QUANTITIES,rangeLabel,tierLabel,document:{getElementById:get,createElement:tag=>new Element(tag)},window:{PRICING_DATA:data,confirm:()=>confirmDiscard},fetch:async()=>({ok:true,json:async()=>snapshot.data}),setTimeout,encodeURIComponent,console};
vm.runInNewContext(source+'\nthis.make=initEditor;',context);editor=context.make(session);
const click=id=>get(id).handlers.click(),change=id=>get(id).handlers.change();
get('editorCard').value='CTC-007';change('editorCard');
assert.equal(get('editorRows').querySelectorAll('input').length,0,'Read-only by default');
const top=get('editorColumns').children[0];assert.equal(top.children.length,9);
for(let i=0;i<8;i++){assert.equal(top.children[i+1].children[0].textContent,QUANTITY_BANDS[i].label);assert.equal(top.children[i+1].children[1].textContent,QUANTITY_BANDS[i].range);}
assert.equal(top.children.slice(1).reduce((sum,h)=>sum+h.colSpan,0),get('editorRows').children[0].children.length-1,'All original prices remain aligned below the eight grouped headers');
click('editorEdit');let input=get('editorRows').querySelectorAll('input').find(e=>e.attrs['aria-label']==='Base Price (EMEA Premium), 10,000–24,999 units');assert.ok(input);input.value='.5';input.handlers.input();
click('editorCancel');assert.equal(published,0);assert.equal(get('editorRows').querySelectorAll('input').length,0);assert.equal(snapshot.data,data,'Cancel preserves data');
click('editorEdit');input=get('editorRows').querySelectorAll('input').find(e=>e.attrs['aria-label']==='Base Price (EMEA Premium), 10,000–24,999 units');input.value='-.5';input.handlers.input();click('editorSave');assert.match(get('editorStatus').textContent,/non-negative/);assert.equal(published,0);
input.value='.5';input.handlers.input();click('editorSave');assert.equal(get('editorConfirmation').hidden,false);assert.equal(published,0,'Review never publishes');
failSave=true;await click('editorConfirm');assert.equal(snapshot.data,data);assert.match(get('editorStatus').textContent,/draft has been kept/);assert.equal(input.value,'.5');
failSave=false;await click('editorConfirm');assert.equal(snapshot.sha,'saved');assert.equal(get('editorRows').querySelectorAll('input').length,0);assert.equal(snapshot.data.rows.find(r=>r.sku==='CTC-007'&&r.tier==='Base Price (EMEA Premium)'&&r.quantityMin===10000).sellingPrice,.5);
click('editorEdit');confirmDiscard=false;assert.equal(editor.discard(),false);confirmDiscard=true;assert.equal(editor.discard(),true);
snapshot=null;editor.reload();assert.equal(get('editorEdit').disabled,false);assert.equal(get('editorAdd').disabled,false);
get('editorCard').value='CTC-007';change('editorCard');click('editorEdit');input=get('editorRows').querySelectorAll('input').find(e=>e.attrs['aria-label']==='Base Price (EMEA Premium), 10,000–24,999 units');input.value='.52';input.handlers.input();click('editorSave');assert.equal(connectRequests,1);assert.equal(input.value,'.52');
snapshot={sha:'fresh',tree:'fresh-tree',data};editor.connected();input=get('editorRows').querySelectorAll('input').find(e=>e.attrs['aria-label']==='Base Price (EMEA Premium), 10,000–24,999 units');assert.equal(input.value,'.52','Draft survives connecting');click('editorSave');await click('editorConfirm');assert.equal(snapshot.data.rows.find(r=>r.sku==='CTC-007'&&r.tier==='Base Price (EMEA Premium)'&&r.quantityMin===10000).sellingPrice,.52);
// A concurrent selected-card change keeps the draft but prevents accidental overwrite.
snapshot=null;editor.reload();get('editorCard').value='CTC-007';change('editorCard');click('editorEdit');snapshot={sha:'concurrent',tree:'tree',data:JSON.parse(JSON.stringify(data))};snapshot.data.rows.find(r=>r.sku==='CTC-007').sellingPrice=99;editor.connected();assert.equal(get('editorSave').disabled,true);assert.match(get('editorStatus').textContent,/changed in GitHub/);click('editorCancel');assert.equal(get('editorRows').querySelectorAll('input').length,0);

console.log('Editor UI tests passed: read-only, edit, cancel, validation, explicit confirmation, failed-save draft retention, saved data.');

const adminHTML=fs.readFileSync('admin.html','utf8');assert.ok(!adminHTML.includes('id="editorCost"')&&!adminHTML.includes('id="editorBasis"'));assert.ok(!adminHTML.includes('id="costBasis"'),'ZIP cost basis selector is removed');assert.ok(!adminHTML.includes('<th scope="col">costBasis</th>'),'Selling-only template excludes cost basis');

// Current NetSuite-backed editor uses actual levels, persists an override and labels it red.
snapshot={sha:'current',tree:'tree',data:JSON.parse(fs.readFileSync('pricing-data.json'))};
editor.reload();get('editorCard').value='CTC-007';change('editorCard');
assert.equal(get('editorRows').children.length,new Set(snapshot.data.rows.filter(r=>r.sku==='CTC-007').map(r=>r.tier)).size);
click('editorEdit');input=get('editorRows').querySelectorAll('input').find(e=>e.attrs['aria-label']==='Base, 10,000–24,999 units');
assert.ok(input);const previous=snapshot;input.value='.987';input.handlers.input();click('editorCancel');assert.equal(snapshot,previous);
click('editorEdit');input=get('editorRows').querySelectorAll('input').find(e=>e.attrs['aria-label']==='Base, 10,000–24,999 units');input.value='.987';input.handlers.input();click('editorSave');await click('editorConfirm');
assert.equal(snapshot.data.rows.find(r=>r.sku==='CTC-007'&&r.tier==='Base'&&r.quantityMin===10000).sellingPrice,.987);
assert.ok(get('editorRows').querySelectorAll('label').some(e=>e.className.includes('manual-price')));
assert.ok(get('editorRows').querySelectorAll('small').some(e=>e.textContent==='Manually updated'));
console.log('Current NetSuite editor: cancel, save, exact levels and red manual labels passed.');
