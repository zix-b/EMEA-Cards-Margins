import assert from 'node:assert/strict';
import {initNetSuite} from '../admin-netsuite.mjs';
class Element{constructor(){this.children=[];this.handlers={};this.dataset={};this.value='';}append(c){this.children.push(c);}replaceChildren(){this.children=[];}addEventListener(k,f){this.handlers[k]=f;}querySelectorAll(){return this.children.map(l=>l.children[0]);}}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
globalThis.document={getElementById:get,createElement:()=>new Element()};
let connected=false,connect=0,dispatch=0,published=0,saved=false;
const data={rows:[{sku:'CTC-007',product:'Card',tier:'EMEA Base',quantityMin:1,quantityMax:null,sellingPrice:.4,costPrice:.1}],costBands:[]};
const preview={version:1,currency:'USD',unit:'Each',fetchedAt:'2026-10-05T12:00:00Z',rows:[{sku:'CTC-007',level:'Base',quantityMin:1,quantityMax:null,sellingPrice:.5}]};
const repo={read:async()=>({sha:'original',data}),preview:async()=>({preview}),sync:async(requestId)=>{assert.match(requestId,/^[a-f0-9-]{36}$/);dispatch++;},publish:async(base,next)=>{published++;assert.equal(base.sha,'original');assert.equal(next.rows[0].sellingPrice,.5);return {sha:'published'};}};
initNetSuite({repository:()=>connected?repo:null,connect:()=>connect++,discard:()=>true,setBusy(){},saved:()=>saved=true});
await get('netsuiteSync').handlers.click();assert.equal(connect,0);get('netsuitePublicConsent').checked=true;await get('netsuiteSync').handlers.click();assert.equal(connect,1);assert.equal(dispatch,0);
connected=true;await get('netsuiteSync').handlers.click();assert.equal(dispatch,1);
await get('netsuiteRefresh').handlers.click();assert.equal(get('netsuiteMappingPanel').hidden,false);
get('netsuiteMapping').querySelectorAll()[1].value='EMEA Base';await get('netsuitePrepare').handlers.click();assert.equal(get('netsuiteReview').hidden,false);
await get('netsuiteApply').handlers.click();assert.equal(published,0);
get('netsuiteApprove').checked=true;await get('netsuiteApprove').handlers.change();await get('netsuiteApply').handlers.click();assert.equal(published,1);assert.equal(saved,true);assert.match(get('netsuiteStatus').textContent,/Published commit/);
console.log('NetSuite UI connection, dispatch, review, confirmation and publish flow passed (mock transport).');
