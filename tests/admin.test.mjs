import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readZip,prepareUpdate,MAX_UPLOAD} from '../pricing-import.mjs';
import {fixture} from './import.test.mjs';
const elements=new Map();function element(){return {value:'',checked:false,disabled:false,hidden:false,textContent:'',children:[],handlers:{},files:[],addEventListener(name,fn){this.handlers[name]=fn;},replaceChildren(){this.children=[];},append(child){this.children.push(child);}};}
const get=id=>{assert.ok(!['costBasis','updateMode'].includes(id),'Removed controls must not be accessed');if(!elements.has(id))elements.set(id,element());return elements.get(id);};
let receivedToken,published=0,cleared=0;
class Repository{constructor(token){receivedToken=token;}async read(){return {sha:'abcdef123',tree:'tree',data:{rows:[{sku:'KEEP'}],costBands:[]}};}clear(){cleared++;}async publish(snapshot,data){assert.equal(snapshot.sha,'abcdef123');assert.ok(data.rows.some(r=>r.sku==='CTC-007'));assert.ok(data.rows.some(r=>r.sku==='KEEP'));published++;return {sha:'published'};}}
const source=fs.readFileSync('admin.mjs','utf8').replace(/^import .*;\n/gm,'');
vm.runInNewContext(source,{readZip,prepareUpdate,MAX_UPLOAD,Repository,initEditor:()=>({reload(){},connected(){},setBusy(){},stop(){},discard(){return true;}}),document:{getElementById:get,createElement:element},window:{PRICING_DATA:{rows:[],costBands:[]},addEventListener(){}},Uint8Array,Set,Number,console});
// Validation is safe without credentials; publication remains disabled.
const offlineBytes=fixture();get('zipFile').files=[{size:offlineBytes.length,arrayBuffer:async()=>offlineBytes.buffer}];await get('uploadForm').handlers.submit({preventDefault(){}});assert.equal(get('previewPanel').hidden,false);get('confirmPublish').checked=true;get('confirmPublish').handlers.change();assert.equal(get('publishButton').disabled,true);await get('publishButton').handlers.click();assert.equal(published,0);
get('githubToken').value='synthetic-token';await get('connectForm').onsubmit({preventDefault(){}});assert.equal(receivedToken,'synthetic-token');assert.equal(get('githubToken').value,'');assert.equal(get('validateButton').disabled,false);
const bytes=fixture();get('zipFile').files=[{size:bytes.length,arrayBuffer:async()=>bytes.buffer}];await get('uploadForm').handlers.submit({preventDefault(){}});assert.equal(get('previewPanel').hidden,false);assert.equal(get('previewRows').children.length,1);assert.equal(get('publishButton').disabled,true);
get('confirmPublish').checked=true;get('confirmPublish').handlers.change();assert.equal(get('publishButton').disabled,false);await get('publishButton').handlers.click();assert.equal(published,1);assert.ok(cleared>0);assert.match(get('message').textContent,/committed successfully/);assert.equal(get('previewPanel').hidden,true);
const html=fs.readFileSync('admin.html','utf8');assert.ok(!/id="(?:costBasis|updateMode)"/.test(html));assert.ok(!/localStorage|sessionStorage/.test(source));
// Every supported basis is read from the ZIP, and header-only costs remain valid.
const sell='sku,product,tier,quantityMin,quantityMax,sellingPrice,currency,unit,source,sourceDate\nCTC-007,Custom Card,Standard Price (EMEA License),1,,0.46,USD,Each,Test,2026-01-01\n';
const cost='sku,quantityMin,quantityMax,costPrice,costBasis,currency,unit,source,sourceDate\n';
async function validateCosts(costs){const raw=fixture(sell,costs);get('zipFile').files=[{size:raw.length,arrayBuffer:async()=>raw.buffer}];await get('uploadForm').handlers.submit({preventDefault(){}});}
for(const basis of ['oppiot','supplier_purchase','average_cost','last_purchase']){await validateCosts(cost+`CTC-007,1,,0.2,${basis},USD,Each,Test,2026-01-01\n`);assert.equal(get('previewPanel').hidden,false);assert.ok(get('previewSummary').textContent.includes(basis));}
await validateCosts(cost);assert.equal(get('previewPanel').hidden,false);assert.match(get('previewSummary').textContent,/not supplied/);
await validateCosts(cost+'CTC-007,1,4999,0.2,average_cost,USD,Each,Test,2026-01-01\nCTC-007,5000,,0.2,last_purchase,USD,Each,Test,2026-01-01\n');assert.equal(get('previewPanel').hidden,true);assert.match(get('message').textContent,/one cost basis per ZIP/);
console.log('Admin interaction test passed: connect, clear token input, ZIP preview, explicit confirmation, publish, disconnect.');
